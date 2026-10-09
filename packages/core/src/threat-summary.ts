import { RISK_LEVELS, THREAT_STATUSES, type RiskLevel, type ThreatStatus } from './enums.js';

// What the diagram and the threat list say about a threat model's threats, worked out from the list the page
// already holds. Pure, so Milestone 5's report can show the same numbers (research #6, #8).

// The open threats of each element: the work still to do on it. A threat counts by its status alone, so a stale
// open threat counts (stale is not a status, spec FR-015), and a trust boundary counts its own threats only,
// never those of what it holds (FR-014). A model-level threat is on no element, so it is on no count.
export function openThreatCounts(threats: readonly { element_id: string | null; status: ThreatStatus }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { element_id, status } of threats) {
    if (element_id === null || status !== 'open') continue;
    counts.set(element_id, (counts.get(element_id) ?? 0) + 1);
  }
  return counts;
}

// The numbers above the threat list (spec FR-021): threats per status, and the open ones per risk level. Every
// status and level is present, with a zero when there are none.
export interface ThreatSummary {
  total: number;
  byStatus: Record<ThreatStatus, number>;
  openByRisk: Record<RiskLevel, number>;
}

export function summarizeThreats(threats: readonly { status: ThreatStatus; risk: RiskLevel }[]): ThreatSummary {
  const byStatus = Object.fromEntries(THREAT_STATUSES.map((status) => [status, 0])) as Record<ThreatStatus, number>;
  const openByRisk = Object.fromEntries(RISK_LEVELS.map((risk) => [risk, 0])) as Record<RiskLevel, number>;
  for (const { status, risk } of threats) {
    byStatus[status] += 1;
    if (status === 'open') openByRisk[risk] += 1;
  }
  return { total: threats.length, byStatus, openByRisk };
}

// Most serious first (spec FR-020). Ties go to the older threat, then to the id, so the order is the same
// whatever order the server happened to answer in.
export function compareByRisk(a: { id: string; risk: RiskLevel; created_at: string }, b: { id: string; risk: RiskLevel; created_at: string }): number {
  return (
    RISK_LEVELS.indexOf(b.risk) - RISK_LEVELS.indexOf(a.risk) ||
    a.created_at.localeCompare(b.created_at) ||
    a.id.localeCompare(b.id)
  );
}
