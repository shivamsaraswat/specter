import { expect } from 'vitest';
import { parse, stringify } from 'yaml';
import {
  LibraryLoadError,
  parseLibrary,
  type LoadIssue,
  type RuleSourceFile,
} from '../src/index.js';

type RuleType = 'external_entity' | 'process' | 'data_store' | 'data_flow';

// One valid rule per element type. Each has a single flag condition, one example that applies and
// one that does not; the data-flow rule also has a flow condition. Titles differ, so the four
// together are a valid library (coverage is not required by parseLibrary unless asked).
const BASE: Record<RuleType, Record<string, unknown>> = {
  external_entity: {
    id: 'ee-spoofing-test',
    element_type: 'external_entity',
    category: 'Spoofing',
    title: 'Test spoofing of {{element}}',
    description: '{{element}} does not prove who it is.',
    likelihood: 'High',
    impact: 'High',
    when: { flags: { authenticated: 'no' } },
    mitigations: ['Require the entity to authenticate.', 'Reject unauthenticated requests.'],
    references: ['CWE-306'],
    examples: {
      applies: [{ flags: { authenticated: 'not_assessed' } }],
      does_not_apply: [{ flags: { authenticated: 'yes' } }],
    },
  },
  process: {
    id: 'p-tampering-test',
    element_type: 'process',
    category: 'Tampering',
    title: 'Test tampering with {{element}}',
    description: '{{element}} accepts input from the internet.',
    likelihood: 'Medium',
    impact: 'High',
    when: { flags: { internet_facing: 'yes' } },
    mitigations: ['Validate every input.', 'Reject unexpected shapes.'],
    references: ['CWE-20'],
    examples: {
      applies: [{ flags: { internet_facing: 'yes' } }],
      does_not_apply: [{ flags: { internet_facing: 'no' } }],
    },
  },
  data_store: {
    id: 'ds-disclosure-test',
    element_type: 'data_store',
    category: 'Information Disclosure',
    title: 'Test disclosure from {{element}}',
    description: '{{element}} is not encrypted at rest.',
    likelihood: 'Medium',
    impact: 'High',
    when: { flags: { encrypted_at_rest: 'no' } },
    mitigations: ['Encrypt the store at rest.', 'Manage keys outside the store.'],
    references: ['CWE-311'],
    examples: {
      applies: [{ flags: { encrypted_at_rest: 'no' } }, {}],
      does_not_apply: [{ flags: { encrypted_at_rest: 'yes' } }],
    },
  },
  data_flow: {
    id: 'df-disclosure-test',
    element_type: 'data_flow',
    category: 'Information Disclosure',
    title: 'Test: {{source}} to {{target}} readable in transit',
    description: '{{element}} carries data from {{source}} to {{target}} in plaintext.',
    likelihood: 'High',
    impact: 'High',
    when: { flags: { encrypted_in_transit: 'no' }, flow: { crosses_trust_boundary: 'yes' } },
    mitigations: ['Encrypt the connection with TLS.', 'Authenticate the server certificate.'],
    references: ['CWE-319', 'https://example.com/guidance'],
    examples: {
      applies: [
        {
          flags: { encrypted_in_transit: 'not_assessed' },
          flow: {
            crosses_trust_boundary: 'yes',
            source_type: 'external_entity',
            target_type: 'process',
          },
        },
      ],
      does_not_apply: [
        {
          flags: { encrypted_in_transit: 'yes' },
          flow: {
            crosses_trust_boundary: 'yes',
            source_type: 'external_entity',
            target_type: 'process',
          },
        },
        { flow: { crosses_trust_boundary: 'no', source_type: 'process', target_type: 'process' } },
      ],
    },
  },
};

export const RULE_TYPES = Object.keys(BASE) as RuleType[];

// An override of `undefined` removes the key.
export function ruleObject(
  type: RuleType,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const rule: Record<string, unknown> = structuredClone(BASE[type]);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete rule[key];
    else rule[key] = value;
  }
  return rule;
}

export function ruleYaml(type: RuleType, overrides: Record<string, unknown> = {}): string {
  // No anchors: an object a test uses twice must be written out twice, as the loader requires.
  return stringify(ruleObject(type, overrides), { aliasDuplicateObjects: false });
}

// A rule as a source file, in the directory of its element type and named after its id.
export function ruleFile(type: RuleType, overrides: Record<string, unknown> = {}): RuleSourceFile {
  const id = String(ruleObject(type, overrides)['id']);
  return { path: `${type}/${id}.yaml`, text: ruleYaml(type, overrides) };
}

export function validRuleFiles(): RuleSourceFile[] {
  return RULE_TYPES.map((type) => ruleFile(type));
}

function idOf(file: RuleSourceFile): string | undefined {
  const match = /^[^/]+\/([^/]+)\.yaml$/.exec(file.path);
  return match?.[1];
}

// Builds a rule set. It adds `retired.yaml` (empty) and `ids.yaml` (every rule id and retired id,
// sorted) unless the caller gives them, so a set is consistent with FR-019a by default and the
// registry tests pass their own files.
export function files(...entries: RuleSourceFile[]): RuleSourceFile[] {
  const result = [...entries];
  if (!result.some((file) => file.path === 'retired.yaml'))
    result.push({ path: 'retired.yaml', text: 'retired: []\n' });
  if (!result.some((file) => file.path === 'ids.yaml')) {
    const ids = new Set<string>();
    for (const file of result) {
      const id = idOf(file);
      if (id) ids.add(id);
    }
    const retired = result.find((file) => file.path === 'retired.yaml');
    const records =
      (parse(retired?.text ?? 'retired: []') as { retired?: { id?: string }[] } | null)?.retired ??
      [];
    for (const record of records) if (typeof record.id === 'string') ids.add(record.id);
    result.push({ path: 'ids.yaml', text: stringify({ ids: [...ids].sort() }) });
  }
  return result;
}

export function replaceFile(set: RuleSourceFile[], path: string, text: string): RuleSourceFile[] {
  return set.map((file) => (file.path === path ? { ...file, text } : file));
}

export function loadIssues(
  set: readonly RuleSourceFile[],
  options?: { requireCoverage?: boolean },
): LoadIssue[] {
  try {
    parseLibrary(set, options);
  } catch (error) {
    if (error instanceof LibraryLoadError) return [...error.issues];
    throw error;
  }
  throw new Error('expected parseLibrary to throw a LibraryLoadError, but it loaded');
}

export function expectIssue(
  issues: readonly LoadIssue[],
  expected: { file: string; rule: string | null; includes: string },
): void {
  const found = issues.some(
    (issue) =>
      issue.file === expected.file &&
      issue.rule === expected.rule &&
      issue.message.includes(expected.includes),
  );
  expect(
    found,
    `no issue ${JSON.stringify(expected)} in:\n${issues.map((i) => JSON.stringify(i)).join('\n')}`,
  ).toBe(true);
}

// One unconditional rule for each of the 15 cells of STRIDE-per-element, so a library is complete.
export function coverageRuleFiles(): RuleSourceFile[] {
  const cells: [RuleType, string, string][] = [
    ['external_entity', 'Spoofing', 'spoofing'],
    ['external_entity', 'Repudiation', 'repudiation'],
    ['process', 'Spoofing', 'spoofing'],
    ['process', 'Tampering', 'tampering'],
    ['process', 'Repudiation', 'repudiation'],
    ['process', 'Information Disclosure', 'disclosure'],
    ['process', 'Denial of Service', 'dos'],
    ['process', 'Elevation of Privilege', 'elevation'],
    ['data_store', 'Tampering', 'tampering'],
    ['data_store', 'Repudiation', 'repudiation'],
    ['data_store', 'Information Disclosure', 'disclosure'],
    ['data_store', 'Denial of Service', 'dos'],
    ['data_flow', 'Tampering', 'tampering'],
    ['data_flow', 'Information Disclosure', 'disclosure'],
    ['data_flow', 'Denial of Service', 'dos'],
  ];
  const prefix = {
    external_entity: 'ee',
    process: 'p',
    data_store: 'ds',
    data_flow: 'df',
  } as const;
  return cells.map(([type, category, word]) =>
    ruleFile(type, {
      id: `${prefix[type]}-${word}-cell`,
      category,
      title: `${category} of {{element}}`,
      when: undefined,
      examples: {
        applies: [
          type === 'data_flow'
            ? {
                flow: {
                  crosses_trust_boundary: 'no',
                  source_type: 'process',
                  target_type: 'process',
                },
              }
            : {},
        ],
      },
    }),
  );
}
