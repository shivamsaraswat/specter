import { describe, expect, it } from 'vitest';
import { parseLibrary } from '../src/index.js';
import {
  expectIssue,
  files,
  loadIssues,
  replaceFile,
  ruleFile,
  validRuleFiles,
} from './helpers.js';

// One case per mistake in FR-012 (SC-004). Each changes one thing in an otherwise valid set and expects
// an issue with the right file, rule and message. A case does not assert that the issue is the only
// one: a duplicate id names two places, and a wrong element type causes follow-on issues. Mistakes in
// retirement records and in the registry are in retirement.test.ts.

const P = 'p-tampering-test';
const processFile = (overrides: Record<string, unknown> = {}) => ruleFile('process', overrides);

// Two process rules that share a variant group and are made exclusive by the flag each requires.
const groupRule = (
  id: string,
  when: unknown,
  applies: unknown[],
  doesNotApply: unknown[],
  extra = {},
) =>
  ruleFile('process', {
    id,
    title: `${id} {{element}}`,
    variant_group: 'p-group',
    when,
    examples: doesNotApply.length > 0 ? { applies, does_not_apply: doesNotApply } : { applies },
    ...extra,
  });

describe('the valid baseline', () => {
  it('loads with no issue', () => {
    expect(() => parseLibrary(files(...validRuleFiles()))).not.toThrow();
  });
});

describe('fields and limits', () => {
  const schemaCases: [string, Record<string, unknown>, string][] = [
    ['a missing description', { description: undefined }, 'description'],
    ['a malformed category', { category: 'Nope' }, 'category'],
    ['a title over 200 characters', { title: 'x'.repeat(201) }, 'title'],
    ['an empty title', { title: '   ' }, 'title'],
    ['a description over 10,000 characters', { description: 'x'.repeat(10_001) }, 'description'],
    [
      'a mitigation over 10,000 characters',
      { mitigations: ['x'.repeat(10_001)] },
      'mitigations[0]',
    ],
    ['an unknown element type', { element_type: 'widget' }, 'element_type'],
    ['trust_boundary as the element type', { element_type: 'trust_boundary' }, 'element_type'],
    ['a missing likelihood', { likelihood: undefined }, 'likelihood'],
    ['a missing impact', { impact: undefined }, 'impact'],
    ['no mitigations', { mitigations: [] }, 'mitigation'],
    ['six mitigations', { mitigations: ['1', '2', '3', '4', '5', '6'] }, 'at most 5'],
    [
      'two mitigations alike, ignoring case',
      { mitigations: ['Use TLS', ' use tls '] },
      'different from each other',
    ],
    ['an id with capitals', { id: 'P-Upper' }, 'id'],
    ['an id over 100 characters', { id: 'p'.repeat(101) }, 'id'],
    ['an id with a trailing hyphen', { id: 'p-trailing-' }, 'id'],
  ];
  it.each(schemaCases)('%s', (_name, overrides, includes) => {
    const file = processFile(overrides);
    // A rule whose id is broken is labelled by its file name, so keep the file name as it was.
    const path = `process/${P}.yaml`;
    const issues = loadIssues(files({ ...file, path }));
    expect(issues.some((i) => i.file === path && i.message.includes(includes))).toBe(true);
    expect(
      issues.every((i) => i.rule === P || (overrides['id'] !== undefined && i.rule !== null)),
    ).toBe(true);
  });

  it('a category STRIDE-per-element does not allow for the type', () => {
    const file = ruleFile('data_store', { category: 'Spoofing' });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: 'ds-disclosure-test',
      includes: 'category',
    });
  });
});

describe('identifiers', () => {
  it('a duplicate identifier in two directories names both files', () => {
    const a = processFile();
    const b = { path: `data_store/${P}.yaml`, text: ruleFile('data_store', { id: P }).text };
    const issues = loadIssues(files(a, b));
    expectIssue(issues, { file: a.path, rule: P, includes: b.path });
    expectIssue(issues, { file: b.path, rule: P, includes: a.path });
  });

  it('reusing a retired identifier', () => {
    const retired = {
      path: 'retired.yaml',
      text: `retired:\n  - id: ${P}\n    retired_on: 2026-10-08\n    reason: Was withdrawn.\n`,
    };
    const rule = processFile();
    expectIssue(loadIssues(files(rule, retired)), {
      file: rule.path,
      rule: P,
      includes: 'retired',
    });
  });
});

describe('conditions', () => {
  it('a flag that is unknown', () => {
    const file = processFile({ when: { flags: { sparkly: 'yes' } } });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: P,
      includes: 'when.flags.sparkly: unknown flag',
    });
  });

  it('a flag of another element type', () => {
    const file = processFile({ when: { flags: { encrypted_at_rest: 'no' } } });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: P,
      includes: 'does not apply to process',
    });
  });

  it('a flag named twice', () => {
    const file = processFile();
    const text = file.text.replace(
      'internet_facing: yes',
      'internet_facing: yes\n    internet_facing: no',
    );
    expect(text).not.toBe(file.text);
    expectIssue(loadIssues(files({ ...file, text })), {
      file: file.path,
      rule: P,
      includes: 'unique',
    });
  });

  it('a flow fact on a rule that is not for data flows', () => {
    const file = processFile({ when: { flow: { crosses_trust_boundary: 'yes' } } });
    expectIssue(loadIssues(files(file)), { file: file.path, rule: P, includes: 'when.flow' });
  });

  it('a flow fact naming an unknown node type', () => {
    const file = ruleFile('data_flow', { when: { flow: { target_type: 'trust_boundary' } } });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: 'df-disclosure-test',
      includes: 'target_type',
    });
  });

  it('a flow fact named twice', () => {
    const file = ruleFile('data_flow');
    const text = file.text.replace(
      'crosses_trust_boundary: yes',
      'crosses_trust_boundary: yes\n    crosses_trust_boundary: no',
    );
    expect(text).not.toBe(file.text);
    expectIssue(loadIssues(files({ ...file, text })), {
      file: file.path,
      rule: 'df-disclosure-test',
      includes: 'unique',
    });
  });

  it('a condition written true or false', () => {
    const file = processFile();
    const text = file.text.replace('internet_facing: yes', 'internet_facing: false');
    expectIssue(loadIssues(files({ ...file, text })), {
      file: file.path,
      rule: P,
      includes: 'write yes or no',
    });
  });
});

describe('variant groups (FR-010d)', () => {
  const yes = { flags: { internet_facing: 'yes' } };
  const no = { flags: { internet_facing: 'no' } };

  it('a malformed label', () => {
    const file = processFile({ variant_group: 'Bad_Group' });
    expectIssue(loadIssues(files(file)), { file: file.path, rule: P, includes: 'variant_group' });
  });

  it('a group whose rules differ in element type', () => {
    const a = groupRule('p-group-a', yes, [yes], [no]);
    const b = ruleFile('data_store', { id: 'ds-group-b', variant_group: 'p-group' });
    // The rule that sorts first is the reference; the other one is reported, and names it.
    expectIssue(loadIssues(files(a, b)), {
      file: a.path,
      rule: 'p-group-a',
      includes: 'ds-group-b is data_store',
    });
  });

  it('a group whose rules differ in category', () => {
    const a = groupRule('p-group-a', yes, [yes], [no]);
    const b = groupRule('p-group-b', no, [no], [yes], { category: 'Information Disclosure' });
    expectIssue(loadIssues(files(a, b)), {
      file: b.path,
      rule: 'p-group-b',
      includes: 'one element type and category',
    });
  });

  it('two rules in one group that can both apply, naming both', () => {
    const a = groupRule('p-group-a', yes, [yes], [no]);
    const b = groupRule('p-group-b', undefined, [{}], []);
    const issues = loadIssues(files(a, b));
    const issue = issues.find((i) => i.message.includes('variant_group'));
    expect(issue).toBeDefined();
    expect(issue?.rule).toBe('p-group-b');
    expect(issue?.message).toContain('p-group-a');
  });

  it('two rules in one group that require different flags can both apply', () => {
    const a = groupRule('p-group-a', yes, [yes], [no]);
    const privileged = { flags: { runs_privileged: 'yes' } };
    const b = groupRule('p-group-b', privileged, [privileged], [{}]);
    expectIssue(loadIssues(files(a, b)), {
      file: b.path,
      rule: 'p-group-b',
      includes: 'p-group-a',
    });
  });

  it('loads once the rules require different values of the same flag', () => {
    const a = groupRule('p-group-a', yes, [yes], [no]);
    const b = groupRule('p-group-b', no, [no], [yes]);
    expect(parseLibrary(files(a, b)).rules).toHaveLength(2);
  });

  it('loads when the exclusion is a data-flow fact', () => {
    const cross = (value: 'yes' | 'no') => ({
      crosses_trust_boundary: value,
      source_type: 'process',
      target_type: 'process',
    });
    const make = (id: string, value: 'yes' | 'no') =>
      ruleFile('data_flow', {
        id,
        title: `${id} {{element}}`,
        variant_group: 'df-group',
        when: { flow: { crosses_trust_boundary: value } },
        examples: {
          applies: [{ flow: cross(value) }],
          does_not_apply: [{ flow: cross(value === 'yes' ? 'no' : 'yes') }],
        },
      });
    expect(
      parseLibrary(files(make('df-group-a', 'yes'), make('df-group-b', 'no'))).rules,
    ).toHaveLength(2);
  });

  it('allows a group of one', () => {
    const a = groupRule('p-group-a', yes, [yes], [no]);
    expect(parseLibrary(files(a)).rules).toHaveLength(1);
  });

  it('does not treat rules in different groups as one group', () => {
    const a = groupRule('p-group-a', yes, [yes], [no]);
    const b = groupRule('p-group-b', undefined, [{}], [], { variant_group: 'p-other-group' });
    expect(parseLibrary(files(a, b)).rules).toHaveLength(2);
  });
});

describe('placeholders', () => {
  it('an unknown placeholder', () => {
    const file = processFile({ title: 'Hello {{name}}' });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: P,
      includes: 'unknown placeholder {{name}}',
    });
  });

  it('a source placeholder in a rule that is not for data flows', () => {
    const file = processFile({ description: 'From {{source}}.' });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: P,
      includes: 'unknown placeholder {{source}}',
    });
  });
});

describe('placeholders in mitigations', () => {
  it.each(['Review {{element}} often', 'Review {{nope}} often', 'Review {{source}} often'])(
    'refuses %s: mitigations are copied as written, so the braces would reach users',
    (mitigation) => {
      const file = processFile({ mitigations: ['Validate every input.', mitigation] });
      expectIssue(loadIssues(files(file)), {
        file: file.path,
        rule: P,
        includes: 'mitigations[1]: placeholders belong in the title and description',
      });
    },
  );

  it('still accepts a mitigation with no braces, or with single braces', () => {
    const file = processFile({
      mitigations: ['Validate every input.', 'Use a schema such as { "type": "object" }.'],
    });
    expect(parseLibrary(files(file)).rules[0]?.mitigations).toHaveLength(2);
  });
});

describe('references', () => {
  it.each([
    'CWE-012',
    'cwe-79',
    'CWE-',
    'CAPEC-0',
    'http://example.com/x',
    'ftp://example.com',
    'just words',
  ])('a malformed reference: %s', (reference) => {
    const file = processFile({ references: [reference] });
    expectIssue(loadIssues(files(file)), { file: file.path, rule: P, includes: 'references[0]' });
  });

  it('a duplicate reference', () => {
    const file = processFile({ references: ['CWE-20', 'CWE-20'] });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: P,
      includes: 'different from each other',
    });
  });

  it('more than ten references', () => {
    const file = processFile({ references: Array.from({ length: 11 }, (_, i) => `CWE-${i + 1}`) });
    expectIssue(loadIssues(files(file)), { file: file.path, rule: P, includes: 'at most 10' });
  });

  it('accepts CWE, CAPEC and https links, ten at most', () => {
    const references = [
      'CWE-79',
      'CAPEC-94',
      'https://owasp.org/www-community/attacks/',
      ...Array.from({ length: 7 }, (_, i) => `CWE-${i + 100}`),
    ];
    expect(parseLibrary(files(processFile({ references }))).rules[0]?.references).toEqual(
      references,
    );
  });
});

describe('titles', () => {
  it('two active rules for one element type with the same title, compared before filling in', () => {
    const a = processFile({ id: 'p-title-a', title: 'Spoofing of {{element}}' });
    const b = processFile({ id: 'p-title-b', title: 'spoofing of {{element}} ' });
    expectIssue(loadIssues(files(a, b)), {
      file: b.path,
      rule: 'p-title-b',
      includes: 'p-title-a',
    });
  });

  it('allows the same title for different element types', () => {
    const a = processFile({ title: 'Same title' });
    const b = ruleFile('data_store', { title: 'Same title' });
    expect(parseLibrary(files(a, b)).rules).toHaveLength(2);
  });
});

describe('examples (FR-011)', () => {
  it('an applies example the rule does not apply to', () => {
    const file = processFile({
      examples: {
        applies: [{ flags: { internet_facing: 'no' } }],
        does_not_apply: [{ flags: { internet_facing: 'no' } }],
      },
    });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: P,
      includes: 'examples.applies[0]: the rule does not apply',
    });
  });

  it('a does_not_apply example the rule applies to, named by list and index', () => {
    const file = processFile({
      examples: {
        applies: [{ flags: { internet_facing: 'yes' } }],
        does_not_apply: [
          { flags: { internet_facing: 'no' } },
          { flags: { internet_facing: 'yes' } },
        ],
      },
    });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: P,
      includes: 'examples.does_not_apply[1]: the rule applies',
    });
  });

  it('an example that is a data flow fact the rule does not match', () => {
    const file = ruleFile('data_flow', {
      examples: {
        applies: [
          {
            flow: { crosses_trust_boundary: 'no', source_type: 'process', target_type: 'process' },
          },
        ],
        does_not_apply: [
          {
            flow: { crosses_trust_boundary: 'no', source_type: 'process', target_type: 'process' },
          },
        ],
      },
    });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: 'df-disclosure-test',
      includes: 'examples.applies[0]',
    });
  });

  it('a rule with conditions and no does_not_apply example', () => {
    const file = processFile({ examples: { applies: [{ flags: { internet_facing: 'yes' } }] } });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: P,
      includes: 'examples.does_not_apply',
    });
  });

  it('a rule with no applies example', () => {
    const file = processFile({ examples: { does_not_apply: [{}] } });
    expectIssue(loadIssues(files(file)), {
      file: file.path,
      rule: P,
      includes: 'examples.applies',
    });
  });

  it('a rule with no conditions needs only an applies example', () => {
    const file = processFile({ when: undefined, examples: { applies: [{}] } });
    expect(parseLibrary(files(file)).rules).toHaveLength(1);
  });

  it('counts a flag that is not assessed as no when it runs an example', () => {
    const file = ruleFile('data_store', {
      examples: {
        applies: [{ flags: { encrypted_at_rest: 'not_assessed' } }, {}],
        does_not_apply: [{ flags: { encrypted_at_rest: 'yes' } }],
      },
    });
    expect(parseLibrary(files(file)).rules).toHaveLength(1);
  });
});

describe('fail closed (FR-013)', () => {
  it('loads nothing when one rule among many is wrong', () => {
    const bad = processFile({ likelihood: 'Severe' });
    expect(() =>
      parseLibrary(files(...validRuleFiles().filter((f) => !f.path.startsWith('process/')), bad)),
    ).toThrow();
  });

  it('replaceFile helper leaves other files alone', () => {
    const set = files(processFile());
    expect(
      replaceFile(set, 'ids.yaml', 'ids: []\n').find((f) => f.path === `process/${P}.yaml`),
    ).toBeDefined();
  });
});
