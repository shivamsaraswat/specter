import { describe, expect, it } from 'vitest';
import { RISK_LEVELS, THREAT_STATUSES, compareByRisk, openThreatCounts, summarizeThreats } from '../src/index.js';

// Phase 2 / Milestone 4: what the canvas shows on each element (spec FR-014, FR-015).
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const BOUNDARY = '33333333-3333-4333-8333-333333333333';
const threat = (element_id: string | null, status: 'open' | 'mitigated' | 'accepted' | 'not_applicable' = 'open') => ({ element_id, status });

describe('openThreatCounts', () => {
  it('counts only open threats', () => {
    const counts = openThreatCounts([threat(A), threat(A, 'mitigated'), threat(A, 'accepted'), threat(A, 'not_applicable'), threat(A)]);
    expect(counts.get(A)).toBe(2);
  });

  it('counts a stale open threat like any other: stale is not a status (FR-015)', () => {
    // The count takes no stale field at all, so a stale threat can only be counted by its status.
    expect(openThreatCounts([{ element_id: A, status: 'open', stale: { reason: 'rule_unknown' } } as never]).get(A)).toBe(1);
  });

  it('never counts a model-level threat: it is on no element', () => {
    const counts = openThreatCounts([threat(null), threat(null)]);
    expect(counts.size).toBe(0);
  });

  it('counts each element separately, and leaves out an element with none open', () => {
    const counts = openThreatCounts([threat(A), threat(B), threat(B), threat(B, 'accepted')]);
    expect([...counts.entries()].sort()).toEqual([[A, 1], [B, 2]]);
    expect(openThreatCounts([threat(A, 'mitigated')]).has(A)).toBe(false);
  });

  // A boundary is just an element id: its members' threats are theirs (spec FR-014).
  it('counts a trust boundary\'s own threats, and not those of what it holds', () => {
    const counts = openThreatCounts([threat(BOUNDARY), threat(A), threat(A)]);
    expect(counts.get(BOUNDARY)).toBe(1);
    expect(counts.get(A)).toBe(2);
  });

  it('gives an empty map for no threats', () => {
    expect(openThreatCounts([]).size).toBe(0);
  });
});

// What the Threats tab shows above the list (spec FR-021), over the whole threat model.
describe('summarizeThreats', () => {
  const row = (status: 'open' | 'mitigated' | 'accepted' | 'not_applicable', risk: 'Low' | 'Medium' | 'High' | 'Critical') => ({ status, risk });

  it('counts the threats in each status', () => {
    const summary = summarizeThreats([row('open', 'High'), row('open', 'Low'), row('mitigated', 'High'), row('accepted', 'Critical'), row('not_applicable', 'Low')]);
    expect(summary.total).toBe(5);
    expect(summary.byStatus).toEqual({ open: 2, mitigated: 1, accepted: 1, not_applicable: 1 });
  });

  it('counts the open threats at each risk level, and only the open ones', () => {
    const summary = summarizeThreats([row('open', 'Critical'), row('open', 'High'), row('open', 'High'), row('mitigated', 'Critical'), row('accepted', 'High')]);
    expect(summary.openByRisk).toEqual({ Low: 0, Medium: 0, High: 2, Critical: 1 });
  });

  it('has a zero for every status and every risk level, so a reader never has to guess a missing one', () => {
    const summary = summarizeThreats([]);
    expect(summary.total).toBe(0);
    expect(Object.keys(summary.byStatus)).toEqual([...THREAT_STATUSES]);
    expect(Object.keys(summary.openByRisk)).toEqual([...RISK_LEVELS]);
    expect(Object.values(summary.byStatus).every((n) => n === 0)).toBe(true);
    expect(Object.values(summary.openByRisk).every((n) => n === 0)).toBe(true);
  });
});

// Critical first (spec FR-020); ties by creation time and then id, so the order is the same on every machine.
describe('compareByRisk', () => {
  const t = (id: string, risk: 'Low' | 'Medium' | 'High' | 'Critical', created_at = '2026-10-01T10:00:00.000Z') => ({ id, risk, created_at });

  it('puts Critical before High before Medium before Low', () => {
    const sorted = [t('a', 'Low'), t('b', 'Critical'), t('c', 'Medium'), t('d', 'High')].sort(compareByRisk);
    expect(sorted.map((x) => x.risk)).toEqual(['Critical', 'High', 'Medium', 'Low']);
  });

  it('orders equal risks by creation time, oldest first', () => {
    const sorted = [t('a', 'High', '2026-10-03T10:00:00.000Z'), t('b', 'High', '2026-10-01T10:00:00.000Z'), t('c', 'High', '2026-10-02T10:00:00.000Z')].sort(compareByRisk);
    expect(sorted.map((x) => x.id)).toEqual(['b', 'c', 'a']);
  });

  it('orders equal risks created at the same moment by id', () => {
    const sorted = [t('b', 'Low'), t('c', 'Low'), t('a', 'Low')].sort(compareByRisk);
    expect(sorted.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('is the same whatever order the threats arrive in', () => {
    const all = [t('1', 'High', '2026-10-02T10:00:00.000Z'), t('2', 'High', '2026-10-02T10:00:00.000Z'), t('3', 'Critical'), t('4', 'Low'), t('5', 'High', '2026-10-01T10:00:00.000Z')];
    const forward = [...all].sort(compareByRisk).map((x) => x.id);
    const backward = [...all].reverse().sort(compareByRisk).map((x) => x.id);
    expect(backward).toEqual(forward);
  });
});
