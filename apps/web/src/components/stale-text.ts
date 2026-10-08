import type { StaleReason, UnmetCondition } from '@specter/core';
import { flagLabel } from '../diagram/flag-labels.js';
import { TYPE_LABELS } from '../diagram/type-labels.js';

// How a stale threat explains itself in the threat list (contracts/web-ui.md, "Stale reason wording").
// Plain strings only: the caller renders them as text.

const PLURALS: Record<string, string> = {
  external_entity: 'external entities',
  process: 'processes',
  data_store: 'data stores',
  data_flow: 'data flows',
};

const typeName = (type: keyof typeof TYPE_LABELS): string => TYPE_LABELS[type].toLowerCase();
const withArticle = (type: keyof typeof TYPE_LABELS): string => `${/^[aeiou]/.test(typeName(type)) ? 'an' : 'a'} ${typeName(type)}`;
const answer = (value: 'yes' | 'no' | 'not_assessed'): string => (value === 'not_assessed' ? 'Not assessed' : value === 'yes' ? 'Yes' : 'No');

function clause(condition: UnmetCondition): string {
  switch (condition.fact) {
    case 'element_type':
      return `it is for ${PLURALS[condition.required] ?? condition.required}; this element is ${withArticle(condition.actual)}`;
    case 'flag':
      return `requires ${flagLabel(condition.flag)} to be ${answer(condition.required)}; it is ${answer(condition.actual)}`;
    case 'crosses_trust_boundary':
      return condition.required === 'yes'
        ? 'requires the flow to cross a trust boundary; it doesn’t'
        : 'requires the flow not to cross a trust boundary; it does';
    case 'source_type':
    case 'target_type':
      return `requires the ${condition.fact === 'source_type' ? 'source' : 'target'} to be ${withArticle(condition.required)}; it is ${withArticle(condition.actual)}`;
  }
}

export function describeStale(stale: StaleReason): string {
  switch (stale.reason) {
    case 'conditions_unmet':
      return `The rule no longer applies: ${stale.unmet.map(clause).join('; ')}.`;
    case 'rule_retired': {
      const replacements = stale.replaced_by.length > 0 ? ` Replaced by: ${stale.replaced_by.join(', ')}.` : '';
      return `Rule retired on ${stale.retired_on}: ${stale.retirement_reason}.${replacements}`;
    }
    case 'rule_unknown':
      return 'This rule is no longer in the library.';
  }
}
