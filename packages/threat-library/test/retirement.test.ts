import { stringify } from 'yaml';
import { describe, expect, it } from 'vitest';
import { parseLibrary, type ElementInput, type RuleSourceFile } from '../src/index.js';
import { expectIssue, files, loadIssues, ruleFile } from './helpers.js';

// Retiring a rule, looking an id up, and the registry of every id ever issued (US5, FR-019 to FR-020,
// FR-019a). Mistakes in the other files are in mistakes.test.ts.

const OLD = 'p-tampering-test';
const processRule = (id: string, extra: Record<string, unknown> = {}) =>
  ruleFile('process', { id, title: `${id} {{element}}`, ...extra });

const retiredYaml = (...records: Record<string, unknown>[]) =>
  stringify({ retired: records }, { aliasDuplicateObjects: false });
const record = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  retired_on: '2026-10-08',
  reason: 'Withdrawn.',
  ...extra,
});
const retiredFile = (...records: Record<string, unknown>[]): RuleSourceFile => ({
  path: 'retired.yaml',
  text: retiredYaml(...records),
});
const idsFile = (...ids: string[]): RuleSourceFile => ({
  path: 'ids.yaml',
  text: stringify({ ids: [...ids].sort() }),
});

const internetFacing: ElementInput = {
  type: 'process',
  name: 'Checkout',
  properties: { flags: { internet_facing: true } },
};

describe('a retired rule', () => {
  it('produces nothing, even for an element it used to match (scenario 1)', () => {
    const before = parseLibrary(files(processRule(OLD)));
    expect(before.candidatesFor(internetFacing).map((c) => c.rule_id)).toEqual([OLD]);

    const after = parseLibrary(files(retiredFile(record(OLD))));
    expect(after.candidatesFor(internetFacing)).toEqual([]);
    expect(after.rules).toEqual([]);
  });

  it('is reported as retired, with its date, reason and replacements (scenario 2)', () => {
    const library = parseLibrary(
      files(
        processRule('p-new-a'),
        processRule('p-new-b'),
        retiredFile(record(OLD, { replaced_by: ['p-new-a', 'p-new-b'] })),
      ),
    );
    expect(library.lookup(OLD)).toEqual({
      status: 'retired',
      retired_on: '2026-10-08',
      reason: 'Withdrawn.',
      replaced_by: ['p-new-a', 'p-new-b'],
    });
  });

  it('gives an empty list of replacements when none were named', () => {
    const library = parseLibrary(files(retiredFile(record(OLD))));
    expect(library.lookup(OLD)).toMatchObject({ status: 'retired', replaced_by: [] });
  });

  it('cannot be reused by a new rule', () => {
    const rule = processRule(OLD);
    expectIssue(loadIssues(files(rule, retiredFile(record(OLD)))), {
      file: rule.path,
      rule: OLD,
      includes: 'retired',
    });
  });
});

describe('lookup (FR-020)', () => {
  const library = parseLibrary(files(processRule('p-live'), retiredFile(record('p-gone'))));

  it('says an active rule is active, and returns it', () => {
    const result = library.lookup('p-live');
    expect(result.status).toBe('active');
    expect(result.status === 'active' && result.rule.id).toBe('p-live');
  });

  it('says a retired rule is retired', () => {
    expect(library.lookup('p-gone').status).toBe('retired');
  });

  it('freezes every result, so a caller cannot change what other callers see', () => {
    for (const ref of ['p-live', 'p-gone', 'nope']) {
      const result = library.lookup(ref);
      expect(Object.isFrozen(result), ref).toBe(true);
      if (result.status === 'retired') expect(Object.isFrozen(result.replaced_by)).toBe(true);
    }
  });

  it('says anything else is unknown, and never throws', () => {
    for (const ref of [
      '',
      'nope',
      'P-LIVE',
      ' p-live',
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'a'.repeat(5000),
    ]) {
      expect(library.lookup(ref), JSON.stringify(ref)).toEqual({ status: 'unknown' });
    }
  });

  it("keeps an id when a rule's wording is improved (scenario 3)", () => {
    const edited = parseLibrary(
      files(
        processRule('p-live', { title: 'A better title for {{element}}', description: 'Better.' }),
      ),
    );
    const result = edited.lookup('p-live');
    expect(result.status === 'active' && result.rule.title).toBe('A better title for {{element}}');
  });
});

describe('a rule retired because it was split (scenario 4)', () => {
  const split = (extra: Parameters<typeof files>[number][]) =>
    files(processRule('p-new-a'), processRule('p-new-b'), ...extra);

  it('loads while both replacements are active', () => {
    expect(() =>
      parseLibrary(split([retiredFile(record(OLD, { replaced_by: ['p-new-a', 'p-new-b'] }))])),
    ).not.toThrow();
  });

  it('fails when a replacement is retired later without updating the first record', () => {
    const set = files(
      processRule('p-new-b'),
      retiredFile(record(OLD, { replaced_by: ['p-new-a', 'p-new-b'] }), record('p-new-a')),
    );
    expectIssue(loadIssues(set), {
      file: 'retired.yaml',
      rule: OLD,
      includes: 'p-new-a is retired',
    });
  });
});

describe('retirement records (FR-019)', () => {
  const rule = processRule('p-new-a');

  it('refuses a record id listed twice', () => {
    expectIssue(loadIssues(files(retiredFile(record(OLD), record(OLD)))), {
      file: 'retired.yaml',
      rule: OLD,
      includes: 'listed twice',
    });
  });

  it('refuses a date that is not real or not in the form YYYY-MM-DD', () => {
    for (const date of ['2026-02-30', '26-10-08', '2026/10/08', 'yesterday']) {
      expectIssue(loadIssues(files(retiredFile(record(OLD, { retired_on: date })))), {
        file: 'retired.yaml',
        rule: OLD,
        includes: 'retired_on',
      });
    }
  });

  it('refuses a missing, empty or over-long reason', () => {
    for (const reason of [undefined, '   ', 'x'.repeat(201)]) {
      expectIssue(loadIssues(files(retiredFile(record(OLD, { reason })))), {
        file: 'retired.yaml',
        rule: OLD,
        includes: 'reason',
      });
    }
  });

  it('accepts a reason of exactly 200 characters', () => {
    expect(
      parseLibrary(files(retiredFile(record(OLD, { reason: 'x'.repeat(200) })))).retired,
    ).toHaveLength(1);
  });

  it('refuses a replacement that does not exist', () => {
    expectIssue(loadIssues(files(retiredFile(record(OLD, { replaced_by: ['p-ghost'] })))), {
      file: 'retired.yaml',
      rule: OLD,
      includes: 'p-ghost is not an active rule',
    });
  });

  it('refuses a replacement that is itself retired', () => {
    expectIssue(
      loadIssues(files(retiredFile(record(OLD, { replaced_by: ['p-also'] }), record('p-also')))),
      {
        file: 'retired.yaml',
        rule: OLD,
        includes: 'p-also is retired',
      },
    );
  });

  it('refuses a rule that replaces itself', () => {
    expectIssue(loadIssues(files(rule, retiredFile(record(OLD, { replaced_by: [OLD] })))), {
      file: 'retired.yaml',
      rule: OLD,
      includes: 'cannot replace itself',
    });
  });

  it('refuses a replacement listed twice', () => {
    expectIssue(
      loadIssues(files(rule, retiredFile(record(OLD, { replaced_by: ['p-new-a', 'p-new-a'] })))),
      {
        file: 'retired.yaml',
        rule: OLD,
        includes: 'listed twice',
      },
    );
  });

  it('refuses more than ten replacements', () => {
    const many = Array.from({ length: 11 }, (_, i) => `p-r${i}`);
    expectIssue(
      loadIssues(
        files(
          ...many.map((id) => processRule(id)),
          retiredFile(record(OLD, { replaced_by: many })),
        ),
      ),
      {
        file: 'retired.yaml',
        rule: OLD,
        includes: 'at most 10',
      },
    );
  });
});

describe('the registry of every id ever issued (FR-019a, scenario 5)', () => {
  const rule = processRule('p-live');

  it('refuses an active rule that is not listed', () => {
    const set = [rule, retiredFile(), idsFile()];
    expectIssue(loadIssues(set), {
      file: rule.path,
      rule: 'p-live',
      includes: 'not listed in ids.yaml',
    });
  });

  it('refuses a retired id that is not listed', () => {
    const set = [retiredFile(record('p-gone')), idsFile()];
    expectIssue(loadIssues(set), {
      file: 'retired.yaml',
      rule: 'p-gone',
      includes: 'not listed in ids.yaml',
    });
  });

  it('refuses an id that is listed but is neither active nor retired: a rule deleted without a record', () => {
    const set = [retiredFile(), idsFile('p-vanished')];
    expectIssue(loadIssues(set), {
      file: 'ids.yaml',
      rule: 'p-vanished',
      includes: 'neither an active rule nor retired',
    });
  });

  it('refuses a rename done without retiring the old id', () => {
    const renamed = processRule('p-renamed');
    const set = [renamed, retiredFile(), idsFile('p-old-name', 'p-renamed')];
    expectIssue(loadIssues(set), {
      file: 'ids.yaml',
      rule: 'p-old-name',
      includes: 'neither an active rule nor retired',
    });
  });

  it('accepts a rename done by retiring the old id and adding the new one', () => {
    const renamed = processRule('p-renamed');
    const set = [
      renamed,
      retiredFile(record('p-old-name', { replaced_by: ['p-renamed'] })),
      idsFile('p-old-name', 'p-renamed'),
    ];
    const library = parseLibrary(set);
    expect(library.lookup('p-old-name')).toMatchObject({
      status: 'retired',
      replaced_by: ['p-renamed'],
    });
    expect(library.lookup('p-renamed').status).toBe('active');
  });

  it('refuses an entry listed twice, out of order or malformed, naming the entry', () => {
    const base = [rule, retiredFile()];
    expectIssue(
      loadIssues([...base, { path: 'ids.yaml', text: 'ids:\n  - p-live\n  - p-live\n' }]),
      {
        file: 'ids.yaml',
        rule: 'p-live',
        includes: 'listed twice',
      },
    );
    expectIssue(
      loadIssues([...base, { path: 'ids.yaml', text: 'ids:\n  - p-live\n  - p-a-before\n' }]),
      {
        file: 'ids.yaml',
        rule: 'p-a-before',
        includes: 'out of order',
      },
    );
    expectIssue(
      loadIssues([...base, { path: 'ids.yaml', text: 'ids:\n  - Bad_Id\n  - p-live\n' }]),
      {
        file: 'ids.yaml',
        rule: 'Bad_Id',
        includes: 'ids[0]',
      },
    );
  });

  it('does not report a vanished id while a rule file is broken, so one mistake is not shown twice', () => {
    const broken = processRule('p-live', { likelihood: 'Severe' });
    const issues = loadIssues([broken, retiredFile(), idsFile('p-live')]);
    expect(issues.some((i) => i.file === 'ids.yaml')).toBe(false);
  });
});
