import { describe, expect, it } from 'vitest';
import type { StaleReason } from '../src/index.js';
import { describeStale } from '../src/stale-text.js';

// The wording of contracts/web-ui.md "Stale reason wording".
const unmet = (...entries: Extract<StaleReason, { reason: 'conditions_unmet' }>['unmet']): StaleReason => ({ reason: 'conditions_unmet', unmet: entries });

describe('describeStale', () => {
  it('names a flag with the editor’s label, what the rule requires and what the element has', () => {
    expect(describeStale(unmet({ fact: 'flag', flag: 'encrypted_in_transit', required: 'no', actual: 'yes' }))).toBe(
      'The rule no longer applies: requires Encrypted in transit to be No; it is Yes.',
    );
  });

  it('says "Not assessed" for a flag nobody answered', () => {
    expect(describeStale(unmet({ fact: 'flag', flag: 'internet_facing', required: 'yes', actual: 'not_assessed' }))).toBe(
      'The rule no longer applies: requires Internet facing to be Yes; it is Not assessed.',
    );
  });

  it('joins several unmet conditions with "; "', () => {
    expect(
      describeStale(
        unmet(
          { fact: 'flag', flag: 'encrypted_in_transit', required: 'no', actual: 'yes' },
          { fact: 'flag', flag: 'authenticated', required: 'no', actual: 'yes' },
        ),
      ),
    ).toBe('The rule no longer applies: requires Encrypted in transit to be No; it is Yes; requires Authenticated to be No; it is Yes.');
  });

  it('names the element type when it changed, in the plural for the rule and with a/an for the element', () => {
    expect(describeStale(unmet({ fact: 'element_type', required: 'process', actual: 'data_store' }))).toBe(
      'The rule no longer applies: it is for processes; this element is a data store.',
    );
    expect(describeStale(unmet({ fact: 'element_type', required: 'data_store', actual: 'external_entity' }))).toBe(
      'The rule no longer applies: it is for data stores; this element is an external entity.',
    );
  });

  it('phrases both ways a flow can fail the boundary condition', () => {
    expect(describeStale(unmet({ fact: 'crosses_trust_boundary', required: 'yes', actual: 'no' }))).toBe(
      'The rule no longer applies: requires the flow to cross a trust boundary; it doesn’t.',
    );
    expect(describeStale(unmet({ fact: 'crosses_trust_boundary', required: 'no', actual: 'yes' }))).toBe(
      'The rule no longer applies: requires the flow not to cross a trust boundary; it does.',
    );
  });

  it('phrases a source or target type that changed', () => {
    expect(describeStale(unmet({ fact: 'source_type', required: 'external_entity', actual: 'process' }))).toBe(
      'The rule no longer applies: requires the source to be an external entity; it is a process.',
    );
    expect(describeStale(unmet({ fact: 'target_type', required: 'data_store', actual: 'process' }))).toBe(
      'The rule no longer applies: requires the target to be a data store; it is a process.',
    );
  });

  it('gives the retirement, with the replacements when there are any', () => {
    const retired: StaleReason = { reason: 'rule_retired', retired_on: '2026-11-02', retirement_reason: 'Split into two rules', replaced_by: ['a-rule', 'b-rule'] };
    expect(describeStale(retired)).toBe('Rule retired on 2026-11-02: Split into two rules. Replaced by: a-rule, b-rule.');
    expect(describeStale({ ...retired, replaced_by: [] })).toBe('Rule retired on 2026-11-02: Split into two rules.');
  });

  it('says a rule that is not in the library is gone', () => {
    expect(describeStale({ reason: 'rule_unknown' })).toBe('This rule is no longer in the library.');
  });

  it('falls back to the raw flag name for a flag the editor has no label for', () => {
    expect(describeStale(unmet({ fact: 'flag', flag: 'brand_new_flag', required: 'yes', actual: 'no' }))).toContain('requires brand_new_flag to be Yes');
  });
});
