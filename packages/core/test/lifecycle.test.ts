import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  REASON_STATUSES,
  THREAT_STATUSES,
  ThreatCreateInput,
  ThreatUpdateInput,
  formatValidationError,
  lifecycleGap,
  needsReason,
} from '../src/index.js';

// Phase 2 / Milestone 4: the rules a request alone can break (data-model.md §2), and what a stored threat
// lacks for its status (spec FR-006). The rules that need other rows (mitigated) are the API's.

const valid = {
  threat_model_id: randomUUID(),
  category: 'Spoofing',
  title: 'Credential stuffing',
  likelihood: 'Medium',
  impact: 'High',
  origin: 'manual',
};

const REQUIRED = 'status_reason: is required when status is accepted or not_applicable';
const LEFT_OUT = 'status_reason: must be left out unless status is accepted or not_applicable';
const NEW_MITIGATED =
  'status: a new threat cannot be mitigated: it has no mitigations yet; set the status after one is implemented or verified';

function messageOf(schema: typeof ThreatCreateInput | typeof ThreatUpdateInput, input: unknown): string | null {
  const result = schema.safeParse(input);
  return result.success ? null : formatValidationError(result.error);
}

describe('the statuses that take a reason', () => {
  it('are accepted and not applicable', () => {
    expect(REASON_STATUSES).toEqual(['accepted', 'not_applicable']);
    expect(THREAT_STATUSES.filter(needsReason)).toEqual(['accepted', 'not_applicable']);
  });
});

describe('ThreatCreateInput lifecycle rules', () => {
  it('refuses a new threat that is mitigated: it has no mitigations yet (FR-003)', () => {
    expect(messageOf(ThreatCreateInput, { ...valid, status: 'mitigated' })).toBe(NEW_MITIGATED);
  });

  it.each(['accepted', 'not_applicable'])('requires a reason with %s (FR-004)', (status) => {
    expect(messageOf(ThreatCreateInput, { ...valid, status })).toBe(REQUIRED);
    expect(messageOf(ThreatCreateInput, { ...valid, status, status_reason: null })).toBe(REQUIRED);
  });

  it.each(['accepted', 'not_applicable'])('accepts a reason with %s', (status) => {
    const parsed = ThreatCreateInput.parse({ ...valid, status, status_reason: 'Covered by the WAF' });
    expect(parsed).toMatchObject({ status, status_reason: 'Covered by the WAF' });
  });

  it('refuses a reason with open (FR-005)', () => {
    expect(messageOf(ThreatCreateInput, { ...valid, status: 'open', status_reason: 'why' })).toBe(LEFT_OUT);
    // The default status is open, so a reason alone is refused too.
    expect(messageOf(ThreatCreateInput, { ...valid, status_reason: 'why' })).toBe(LEFT_OUT);
  });

  it('accepts open without a reason, and with the status left out', () => {
    expect(ThreatCreateInput.safeParse({ ...valid, status: 'open' }).success).toBe(true);
    expect(ThreatCreateInput.safeParse(valid).success).toBe(true);
  });
});

describe('ThreatUpdateInput lifecycle rules', () => {
  // Moving into mitigated needs an implemented mitigation, which only the API can see (research #1).
  it('accepts mitigated: whether a mitigation is implemented is the API\'s to check', () => {
    expect(ThreatUpdateInput.parse({ status: 'mitigated' })).toEqual({ status: 'mitigated' });
  });

  it.each(['accepted', 'not_applicable'])('requires a reason in the same request as %s (FR-004)', (status) => {
    expect(messageOf(ThreatUpdateInput, { status })).toBe(REQUIRED);
    expect(ThreatUpdateInput.parse({ status, status_reason: 'why' })).toEqual({ status, status_reason: 'why' });
  });

  it.each(['open', 'mitigated'])('refuses a reason in the same request as %s, which would clear it (FR-005)', (status) => {
    expect(messageOf(ThreatUpdateInput, { status, status_reason: 'why' })).toBe(LEFT_OUT);
  });

  // The stored status decides whether a reason alone is allowed, so the schema cannot (data-model.md §2).
  it('lets a reason travel alone, and any other field without a lifecycle field', () => {
    expect(ThreatUpdateInput.safeParse({ status_reason: 'why' }).success).toBe(true);
    expect(ThreatUpdateInput.safeParse({ title: 'Renamed' }).success).toBe(true);
    expect(ThreatUpdateInput.safeParse({ likelihood: 'Low', element_id: null }).success).toBe(true);
  });

  it('keeps the field rules too: a blank reason is "must not be empty"', () => {
    expect(messageOf(ThreatUpdateInput, { status: 'accepted', status_reason: '   ' })).toContain('status_reason: must not be empty');
  });
});

describe('the lifecycle messages', () => {
  it('never contain a submitted value', () => {
    const inputs = [
      { ...valid, status: 'open', status_reason: 'SECRET-VALUE' },
      { ...valid, status: 'accepted', status_reason: null, title: 'SECRET-TITLE' },
    ];
    for (const input of inputs) {
      const message = messageOf(ThreatCreateInput, input);
      expect(message).not.toBeNull();
      expect(message).not.toContain('SECRET');
    }
    expect(messageOf(ThreatUpdateInput, { status: 'mitigated', status_reason: 'SECRET-VALUE' })).not.toContain('SECRET');
  });
});

describe('lifecycleGap: what a stored threat lacks for its status (FR-006)', () => {
  const mitigation = (status: string) => ({ status }) as { status: 'proposed' | 'implemented' | 'verified' };

  it.each(['accepted', 'not_applicable'] as const)('%s with no reason lacks a reason', (status) => {
    expect(lifecycleGap({ status, status_reason: null }, [])).toBe('reason_missing');
  });

  it.each(['accepted', 'not_applicable'] as const)('%s with a reason lacks nothing', (status) => {
    expect(lifecycleGap({ status, status_reason: 'why' }, [])).toBeNull();
  });

  it('mitigated with no mitigation, or only proposed ones, lacks an implemented mitigation', () => {
    expect(lifecycleGap({ status: 'mitigated', status_reason: null }, [])).toBe('no_implemented_mitigation');
    expect(lifecycleGap({ status: 'mitigated', status_reason: null }, [mitigation('proposed'), mitigation('proposed')])).toBe(
      'no_implemented_mitigation',
    );
  });

  it('mitigated with one implemented, or one verified, mitigation lacks nothing', () => {
    expect(lifecycleGap({ status: 'mitigated', status_reason: null }, [mitigation('proposed'), mitigation('implemented')])).toBeNull();
    expect(lifecycleGap({ status: 'mitigated', status_reason: null }, [mitigation('verified')])).toBeNull();
  });

  it('open lacks nothing, whatever its mitigations', () => {
    expect(lifecycleGap({ status: 'open', status_reason: null }, [])).toBeNull();
    expect(lifecycleGap({ status: 'open', status_reason: null }, [mitigation('proposed')])).toBeNull();
  });
});
