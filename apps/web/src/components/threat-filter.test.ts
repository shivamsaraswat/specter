import { describe, expect, it } from 'vitest';
import { ELEMENT_ID, threat } from '../test-utils.js';
import { NO_FILTER, applyThreatFilter, isFiltered, parseThreatFilter, toSearchParams, type ThreatFilter } from './threat-filter.js';

// The threat list's filters, kept in the page's address (data-model.md §5; spec FR-019, FR-020).

const OTHER = '99999999-1111-4111-8111-999999999999';
const parse = (query: string): ThreatFilter => parseThreatFilter(new URLSearchParams(query));

describe('parseThreatFilter', () => {
  it('is no filter at all for an empty address', () => {
    expect(parse('')).toEqual(NO_FILTER);
    expect(isFiltered(parse(''))).toBe(false);
  });

  it('reads every key', () => {
    const filter = parse(`element=${ELEMENT_ID}&status=open&status=accepted&risk=Critical&risk=High&origin=rule&stale=1&sort=risk`);
    expect(filter).toEqual({
      element: { kind: 'element', id: ELEMENT_ID },
      statuses: ['open', 'accepted'],
      risks: ['High', 'Critical'],
      origin: 'rule',
      staleOnly: true,
      sort: 'risk',
    });
    expect(isFiltered(filter)).toBe(true);
  });

  it('reads element=none as the threats linked to no element', () => {
    expect(parse('element=none').element).toEqual({ kind: 'none' });
  });

  it('drops a value it does not know, without a message', () => {
    const filter = parse('element=not-a-uuid&status=closed&status=open&risk=Extreme&origin=ai2&stale=yes&sort=name');
    expect(filter).toEqual({ ...NO_FILTER, statuses: ['open'] });
  });

  it('puts statuses and risks in their own order, once each, whatever order the address had', () => {
    expect(parse('status=not_applicable&status=open&status=open').statuses).toEqual(['open', 'not_applicable']);
    expect(parse('risk=Low&risk=Critical&risk=Low').risks).toEqual(['Low', 'Critical']);
  });

  it('ignores a key it does not know', () => {
    expect(parse('page=3&foo=bar')).toEqual(NO_FILTER);
  });

  it('never takes an element id that is not a UUID, so nothing user-typed is used as one', () => {
    expect(parse('element=<script>alert(1)</script>').element).toEqual({ kind: 'any' });
    expect(parse(`element=${ELEMENT_ID}x`).element).toEqual({ kind: 'any' });
  });
});

describe('toSearchParams', () => {
  it('writes nothing for no filter', () => {
    expect(toSearchParams(NO_FILTER).toString()).toBe('');
  });

  it('writes each key once, in a fixed order, leaving defaults out', () => {
    const filter: ThreatFilter = {
      element: { kind: 'element', id: ELEMENT_ID },
      statuses: ['open', 'accepted'],
      risks: ['High', 'Critical'],
      origin: 'manual',
      staleOnly: true,
      sort: 'risk',
    };
    expect(toSearchParams(filter).toString()).toBe(
      `element=${ELEMENT_ID}&status=open&status=accepted&risk=High&risk=Critical&origin=manual&stale=1&sort=risk`,
    );
    expect(toSearchParams({ ...NO_FILTER, element: { kind: 'none' } }).toString()).toBe('element=none');
    expect(toSearchParams({ ...NO_FILTER, sort: 'created' }).toString()).toBe('');
  });

  it('round-trips: what is written reads back as the same filter', () => {
    const filter = parse(`stale=1&sort=risk&status=mitigated&element=none&risk=Low&origin=manual`);
    expect(parse(toSearchParams(filter).toString())).toEqual(filter);
  });
});

describe('applyThreatFilter', () => {
  const rows = [
    threat({ id: 'a', title: 'A', element_id: ELEMENT_ID, status: 'open', risk: 'Critical', origin: 'rule', library_ref: 'r1', created_at: '2026-10-01T10:00:00.000Z' }),
    threat({ id: 'b', title: 'B', element_id: ELEMENT_ID, status: 'accepted', status_reason: 'x', risk: 'Low', origin: 'manual', created_at: '2026-10-02T10:00:00.000Z' }),
    threat({ id: 'c', title: 'C', element_id: OTHER, status: 'open', risk: 'High', origin: 'rule', library_ref: 'r2', stale: { reason: 'rule_unknown' }, created_at: '2026-10-03T10:00:00.000Z' }),
    threat({ id: 'd', title: 'D', element_id: null, status: 'mitigated', risk: 'Medium', origin: 'manual', created_at: '2026-10-04T10:00:00.000Z' }),
  ];
  const ids = (filter: Partial<ThreatFilter>) => applyThreatFilter(rows as never, { ...NO_FILTER, ...filter }).map((t) => t.id);

  it('keeps everything, in the server\'s order, when nothing is chosen', () => {
    expect(ids({})).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filters by element: one element, or none at all', () => {
    expect(ids({ element: { kind: 'element', id: ELEMENT_ID } })).toEqual(['a', 'b']);
    expect(ids({ element: { kind: 'none' } })).toEqual(['d']);
    expect(ids({ element: { kind: 'element', id: '00000000-0000-4000-8000-0000000000ff' } })).toEqual([]);
  });

  it('filters by status and by risk, several values meaning any of them', () => {
    expect(ids({ statuses: ['open'] })).toEqual(['a', 'c']);
    expect(ids({ statuses: ['accepted', 'mitigated'] })).toEqual(['b', 'd']);
    expect(ids({ risks: ['Critical', 'High'] })).toEqual(['a', 'c']);
  });

  it('filters by origin, and to stale threats only', () => {
    expect(ids({ origin: 'rule' })).toEqual(['a', 'c']);
    expect(ids({ origin: 'manual' })).toEqual(['b', 'd']);
    expect(ids({ staleOnly: true })).toEqual(['c']);
  });

  it('needs a threat to match every filter chosen', () => {
    expect(ids({ statuses: ['open'], risks: ['Critical', 'High'], origin: 'rule', staleOnly: true })).toEqual(['c']);
    expect(ids({ element: { kind: 'element', id: ELEMENT_ID }, statuses: ['open'] })).toEqual(['a']);
    expect(ids({ statuses: ['mitigated'], origin: 'rule' })).toEqual([]);
  });

  it('orders by risk, most serious first, when asked', () => {
    expect(ids({ sort: 'risk' })).toEqual(['a', 'c', 'd', 'b']);
  });

  it('does not change the list it was given', () => {
    const before = rows.map((t) => t.id);
    applyThreatFilter(rows as never, { ...NO_FILTER, sort: 'risk' });
    expect(rows.map((t) => t.id)).toEqual(before);
  });
});
