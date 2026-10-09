import type { z } from 'zod';
import type { MitigationStatus, ThreatStatus } from './enums.js';

// The rules a request alone can break, and what a stored threat lacks for its status (Phase 2 / Milestone 4).
// The rule that moving into "mitigated" needs an implemented or verified mitigation is not here: it depends on
// other rows, so the API checks it under row locks when a user sets the status (research #1, #3).

// The statuses that record a decision, and so carry the reason for it (spec FR-004, FR-005).
export const REASON_STATUSES = ['accepted', 'not_applicable'] as const;

export function needsReason(status: ThreatStatus): boolean {
  return (REASON_STATUSES as readonly string[]).includes(status);
}

interface LifecycleInput {
  status?: ThreatStatus;
  status_reason?: string | null;
}

// For .superRefine on the final create and update schemas. zod 4.6 throws on .omit() and .partial() of an object
// that carries a refinement, so the schemas are refined last (research #2). The messages are fixed text and never
// echo a submitted value (Phase 1 M5 FR-012).
export function threatLifecycleIssues(mode: 'create' | 'update') {
  return (value: LifecycleInput, ctx: z.RefinementCtx): void => {
    const { status, status_reason: reason } = value;
    if (mode === 'create' && status === 'mitigated') {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'a new threat cannot be mitigated: it has no mitigations yet; set the status after one is implemented or verified',
      });
    }
    // An update that leaves the status out says nothing about the reason's placement: the stored status decides.
    if (status === undefined) return;
    if (needsReason(status) && (reason === undefined || reason === null)) {
      ctx.addIssue({ code: 'custom', path: ['status_reason'], message: 'is required when status is accepted or not_applicable' });
    } else if (!needsReason(status) && reason !== undefined && reason !== null) {
      ctx.addIssue({ code: 'custom', path: ['status_reason'], message: 'must be left out unless status is accepted or not_applicable' });
    }
  };
}

// What a stored threat is missing for the status it has (spec FR-006). Computed from what the page already holds,
// never stored: a mitigation changing can change the answer.
export type LifecycleGap = 'reason_missing' | 'no_implemented_mitigation';

export function lifecycleGap(
  threat: { status: ThreatStatus; status_reason: string | null },
  mitigations: readonly { status: MitigationStatus }[],
): LifecycleGap | null {
  if (needsReason(threat.status)) return threat.status_reason === null ? 'reason_missing' : null;
  if (threat.status === 'mitigated') {
    return mitigations.some((m) => m.status === 'implemented' || m.status === 'verified') ? null : 'no_implemented_mitigation';
  }
  return null;
}
