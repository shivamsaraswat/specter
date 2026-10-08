import { matches, type Facts } from './evaluate.js';
import type { LoadIssue } from './errors.js';
import type { RetirementRecord, Rule, RuleExample } from './rule-schema.js';

// The checks that compare rules with each other (research #7). They run on rules that already passed
// their own file's checks, so one broken file does not cause a cascade of follow-on issues.

export interface SourcedRule {
  file: string;
  rule: Rule;
}

const issue = (source: SourcedRule, message: string): LoadIssue => ({
  file: source.file,
  rule: source.rule.id,
  message,
});

const byId = (a: SourcedRule, b: SourcedRule): number =>
  a.rule.id < b.rule.id ? -1 : a.rule.id > b.rule.id ? 1 : 0;

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

// Two files with one id: each issue names the other file (a rule's id is permanent and unique).
function duplicateIds(rules: readonly SourcedRule[]): LoadIssue[] {
  const issues: LoadIssue[] = [];
  for (const group of groupBy(rules, (s) => s.rule.id).values()) {
    if (group.length < 2) continue;
    for (const source of group) {
      const others = group.filter((other) => other !== source).map((other) => other.file);
      issues.push(
        issue(source, `id: also defined in ${others.join(', ')}; an id belongs to one rule`),
      );
    }
  }
  return issues;
}

function reusedRetiredIds(
  rules: readonly SourcedRule[],
  retired: readonly RetirementRecord[],
): LoadIssue[] {
  const retiredIds = new Set(retired.map((record) => record.id));
  return rules
    .filter((source) => retiredIds.has(source.rule.id))
    .map((source) =>
      issue(
        source,
        'id: this id was retired (see retired.yaml); an id is never reused, so choose a new one',
      ),
    );
}

// Titles are compared as written, before names are filled in, so two rules cannot give the user two
// identical threats for one element.
function duplicateTitles(rules: readonly SourcedRule[]): LoadIssue[] {
  const issues: LoadIssue[] = [];
  const key = (s: SourcedRule): string =>
    `${s.rule.element_type}\n${s.rule.title.trim().toLowerCase()}`;
  for (const group of groupBy([...rules].sort(byId), key).values()) {
    const [first, ...rest] = group;
    for (const source of rest) {
      issues.push(
        issue(
          source,
          `title: same title as ${first?.rule.id ?? 'another rule'}; titles are unique within an element type`,
        ),
      );
    }
  }
  return issues;
}

// The conditions of a rule as a map from what is tested to the value it must have.
function conditionsOf(rule: Rule): Map<string, string> {
  const conditions = new Map<string, string>();
  for (const [flag, value] of Object.entries(rule.when.flags))
    conditions.set(`flag ${flag}`, value);
  for (const [fact, value] of Object.entries(rule.when.flow))
    conditions.set(`flow fact ${fact}`, value);
  return conditions;
}

// Two conjunctions can both be true unless they require different values of the same thing (FR-010d).
function exclusive(a: Rule, b: Rule): boolean {
  const left = conditionsOf(a);
  for (const [what, value] of conditionsOf(b)) {
    const other = left.get(what);
    if (other !== undefined && other !== value) return true;
  }
  return false;
}

function variantGroups(rules: readonly SourcedRule[]): LoadIssue[] {
  const issues: LoadIssue[] = [];
  const grouped = rules.filter((s) => s.rule.variant_group !== null);
  for (const [label, members] of groupBy(
    [...grouped].sort(byId),
    (s) => s.rule.variant_group ?? '',
  )) {
    const [first] = members;
    if (!first) continue;
    for (const source of members.slice(1)) {
      if (
        source.rule.element_type !== first.rule.element_type ||
        source.rule.category !== first.rule.category
      ) {
        issues.push(
          issue(
            source,
            `variant_group "${label}": must hold rules for one element type and category, but ${first.rule.id} is ${first.rule.element_type} / ${first.rule.category}`,
          ),
        );
      }
    }
    // Every pair, not only each rule against the first: a group is only a set of alternatives if no two
    // of its members can apply to the same element.
    members.forEach((source, index) => {
      for (const earlier of members.slice(0, index)) {
        if (earlier.rule.element_type !== source.rule.element_type) continue;
        if (!exclusive(earlier.rule, source.rule)) {
          issues.push(
            issue(
              source,
              `variant_group "${label}": can apply together with ${earlier.rule.id}; make each pair differ in the value of some flag or flow fact, or put them in different groups`,
            ),
          );
        }
      }
    });
  }
  return issues;
}

// An example as the element facts the rule's conditions are tested against: yes is true, no is false,
// and not assessed is absent (which counts as no).
function factsOf(example: RuleExample): Facts {
  const flags: Record<string, boolean> = {};
  for (const [flag, state] of Object.entries(example.flags)) {
    if (state !== 'not_assessed') flags[flag] = state === 'yes';
  }
  return example.flow
    ? {
        flags,
        flow: {
          crosses_trust_boundary: example.flow.crosses_trust_boundary === 'yes',
          source_type: example.flow.source_type,
          target_type: example.flow.target_type,
        },
      }
    : { flags };
}

// Every example must behave as the list it is in says (FR-011).
function examples(rules: readonly SourcedRule[]): LoadIssue[] {
  const issues: LoadIssue[] = [];
  for (const source of rules) {
    const lists = [
      ['applies', source.rule.examples.applies, true],
      ['does_not_apply', source.rule.examples.does_not_apply, false],
    ] as const;
    for (const [name, items, expected] of lists) {
      items.forEach((item, index) => {
        if (matches(source.rule, factsOf(item)) !== expected) {
          issues.push(
            issue(
              source,
              `examples.${name}[${index}]: the rule ${expected ? 'does not apply' : 'applies'} to this example`,
            ),
          );
        }
      });
    }
  }
  return issues;
}

const RETIRED = 'retired.yaml';
const IDS = 'ids.yaml';

// A record's id must be unique, and every replacement must be an active rule: a retired rule's
// replacement that is retired later means updating the record in the same change (FR-019).
function retirementIssues(
  rules: readonly SourcedRule[],
  retired: readonly RetirementRecord[],
): LoadIssue[] {
  const issues: LoadIssue[] = [];
  const active = new Set(rules.map((source) => source.rule.id));
  const retiredIds = new Set(retired.map((record) => record.id));
  const seen = new Set<string>();
  for (const record of retired) {
    const add = (message: string): void => {
      issues.push({ file: RETIRED, rule: record.id, message });
    };
    if (seen.has(record.id)) add('id: listed twice in retired.yaml');
    seen.add(record.id);
    const listed = new Set<string>();
    for (const replacement of record.replaced_by) {
      if (listed.has(replacement)) add(`replaced_by: ${replacement} is listed twice`);
      listed.add(replacement);
      if (replacement === record.id) add('replaced_by: a rule cannot replace itself');
      else if (retiredIds.has(replacement)) {
        add(
          `replaced_by: ${replacement} is retired, so point to the rule that replaced it and update this record`,
        );
      } else if (!active.has(replacement)) add(`replaced_by: ${replacement} is not an active rule`);
    }
  }
  return issues;
}

// ids.yaml lists every id ever issued, so the library remembers an id that vanishes (FR-019a):
// the registry must equal the active ids plus the retired ids.
export function registryIssues(
  rules: readonly SourcedRule[],
  retired: readonly RetirementRecord[],
  registry: readonly string[],
  { judgeVanished }: { judgeVanished: boolean },
): LoadIssue[] {
  const issues: LoadIssue[] = [];
  const listed = new Set(registry);
  const active = new Set(rules.map((source) => source.rule.id));
  const retiredIds = new Set(retired.map((record) => record.id));

  for (const source of rules) {
    if (!listed.has(source.rule.id)) {
      issues.push(issue(source, 'id: not listed in ids.yaml; add it there, in sorted order'));
    }
  }
  for (const record of retired) {
    if (!listed.has(record.id)) {
      issues.push({
        file: RETIRED,
        rule: record.id,
        message: 'id: not listed in ids.yaml; an id is never removed from it',
      });
    }
  }
  // A rule whose own file failed is missing from `rules`, so it would look vanished: only judge this
  // when every file was fine.
  if (judgeVanished) {
    for (const id of registry) {
      if (!active.has(id) && !retiredIds.has(id)) {
        issues.push({
          file: IDS,
          rule: id,
          message:
            'listed in ids.yaml but neither an active rule nor retired: rename or delete a rule only by retiring it',
        });
      }
    }
  }
  return issues;
}

export function crossRuleIssues(
  rules: readonly SourcedRule[],
  retired: readonly RetirementRecord[],
): LoadIssue[] {
  return [
    ...duplicateIds(rules),
    ...reusedRetiredIds(rules, retired),
    ...duplicateTitles(rules),
    ...variantGroups(rules),
    ...examples(rules),
    ...retirementIssues(rules, retired),
  ];
}
