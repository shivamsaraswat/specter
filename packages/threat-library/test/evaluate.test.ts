import { describe, expect, it } from 'vitest';
import {
  LibraryInputError,
  parseLibrary,
  type ElementInput,
  type FlowContext,
} from '../src/index.js';
import { files, ruleFile } from './helpers.js';

const flow = (overrides: Partial<FlowContext> = {}): FlowContext => ({
  crosses_trust_boundary: false,
  source_type: 'process',
  target_type: 'process',
  source_name: 'Source',
  target_name: 'Target',
  ...overrides,
});

const element = (overrides: Partial<ElementInput> = {}): ElementInput => ({
  type: 'process',
  name: 'Checkout',
  properties: {},
  ...overrides,
});

const flowElement = (
  properties: unknown = {},
  context: Partial<FlowContext> = {},
): ElementInput => ({
  type: 'data_flow',
  name: 'Card details',
  properties,
  flow: flow(context),
});

// Examples are declared accurately, because the load checks run every one (US3, FR-011).
type Example = Record<string, unknown>;
const rule = (
  type: 'process' | 'data_flow',
  id: string,
  when: unknown,
  applies: Example[],
  doesNotApply: Example[] = [],
) =>
  ruleFile(type, {
    id,
    title: `${id} {{element}}`,
    when,
    examples: doesNotApply.length > 0 ? { applies, does_not_apply: doesNotApply } : { applies },
  });

const process = (id: string, when: unknown, applies: Example[], doesNotApply: Example[] = []) =>
  rule('process', id, when, applies, doesNotApply);
const dataFlow = (id: string, when: unknown, applies: Example[], doesNotApply: Example[] = []) =>
  rule('data_flow', id, when, applies, doesNotApply);

const flowFact = (
  crosses: 'yes' | 'no',
  source = 'process',
  target = 'process',
  flags?: Example,
): Example => ({
  ...(flags ? { flags } : {}),
  flow: { crosses_trust_boundary: crosses, source_type: source, target_type: target },
});

const load = (...rules: ReturnType<typeof ruleFile>[]) => parseLibrary(files(...rules));
const ids = (library: ReturnType<typeof load>, input: ElementInput) =>
  library.candidatesFor(input).map((c) => c.rule_id);

describe('candidatesFor: which rules apply (US1)', () => {
  it('returns exactly the rules whose conditions hold', () => {
    const library = load(
      process(
        'p-internet',
        { flags: { internet_facing: 'yes' } },
        [{ flags: { internet_facing: 'yes' } }],
        [{ flags: { internet_facing: 'no' } }],
      ),
      process(
        'p-private',
        { flags: { internet_facing: 'no' } },
        [{}],
        [{ flags: { internet_facing: 'yes' } }],
      ),
    );
    expect(ids(library, element({ properties: { flags: { internet_facing: true } } }))).toEqual([
      'p-internet',
    ]);
    expect(ids(library, element({ properties: { flags: { internet_facing: false } } }))).toEqual([
      'p-private',
    ]);
  });

  it('counts a flag that is not assessed as no (scenario 2)', () => {
    const library = load(
      process(
        'p-private',
        { flags: { internet_facing: 'no' } },
        [{}],
        [{ flags: { internet_facing: 'yes' } }],
      ),
    );
    expect(ids(library, element({ properties: {} }))).toEqual(['p-private']);
    expect(ids(library, element({ properties: { flags: {} } }))).toEqual(['p-private']);
    expect(ids(library, element({ properties: { flags: { internet_facing: false } } }))).toEqual([
      'p-private',
    ]);
    expect(ids(library, element({ properties: { flags: { internet_facing: true } } }))).toEqual([]);
  });

  it('requires yes to be a flag set to yes (scenario 3)', () => {
    const library = load(
      process(
        'p-internet',
        { flags: { internet_facing: 'yes' } },
        [{ flags: { internet_facing: 'yes' } }],
        [{}],
      ),
    );
    expect(ids(library, element({ properties: {} }))).toEqual([]);
    expect(ids(library, element({ properties: { flags: { internet_facing: false } } }))).toEqual(
      [],
    );
    expect(ids(library, element({ properties: { flags: { internet_facing: true } } }))).toEqual([
      'p-internet',
    ]);
  });

  it('needs every condition to hold', () => {
    const library = load(
      process(
        'p-both',
        { flags: { internet_facing: 'yes', runs_privileged: 'yes' } },
        [{ flags: { internet_facing: 'yes', runs_privileged: 'yes' } }],
        [{ flags: { internet_facing: 'yes' } }],
      ),
    );
    expect(ids(library, element({ properties: { flags: { internet_facing: true } } }))).toEqual([]);
    expect(ids(library, element({ properties: { flags: { runs_privileged: true } } }))).toEqual([]);
    expect(
      ids(
        library,
        element({ properties: { flags: { internet_facing: true, runs_privileged: true } } }),
      ),
    ).toEqual(['p-both']);
  });

  it('applies a rule with no conditions to every element of its type', () => {
    const library = load(process('p-always', undefined, [{}]));
    expect(ids(library, element())).toEqual(['p-always']);
    expect(ids(library, element({ properties: { flags: { runs_privileged: true } } }))).toEqual([
      'p-always',
    ]);
  });

  it('never applies a rule written for another element type', () => {
    const library = load(process('p-always', undefined, [{}]), ruleFile('data_store'));
    expect(ids(library, element({ type: 'external_entity' }))).toEqual([]);
    expect(ids(library, { type: 'data_store', name: 'DB', properties: {} })).toEqual([
      'ds-disclosure-test',
    ]);
  });

  it('returns nothing for a trust boundary (scenario 4)', () => {
    const library = load(process('p-always', undefined, [{}]));
    expect(library.candidatesFor({ type: 'trust_boundary', name: 'DMZ', properties: {} })).toEqual(
      [],
    );
  });

  it('ignores technology tags', () => {
    const library = load(process('p-always', undefined, [{}]));
    const plain = library.candidatesFor(element());
    const tagged = library.candidatesFor(
      element({ properties: { tags: ['nginx', 'PostgreSQL 16'] } }),
    );
    expect(tagged).toEqual(plain);
  });

  it('gives the same candidates every time (scenario 5)', () => {
    const library = load(process('p-b', undefined, [{}]), process('p-a', undefined, [{}]));
    const input = element({ properties: { flags: { internet_facing: true } } });
    expect(library.candidatesFor(input)).toEqual(library.candidatesFor(input));
  });

  it('orders candidates by rule id in code-unit order, whatever order the files came in', () => {
    const wanted = ['p-a-b', 'p-a10', 'p-a9', 'p-ab', 'p-b'];
    const shuffled = ['p-ab', 'p-a9', 'p-b', 'p-a10', 'p-a-b'];
    const library = load(...shuffled.map((id) => process(id, undefined, [{}])));
    expect(ids(library, element())).toEqual(wanted);
    expect(wanted).toEqual([...wanted].sort());
  });

  it('shapes a candidate as contracts/library-api.md says', () => {
    const library = load(
      ruleFile('process', {
        id: 'p-shape',
        title: 'Shape of {{element}}',
        description: 'About {{element}}.',
        variant_group: 'p-shape-group',
        when: undefined,
        references: undefined,
        examples: { applies: [{}] },
      }),
    );
    expect(library.candidatesFor(element({ name: 'Billing' }))).toEqual([
      {
        rule_id: 'p-shape',
        category: 'Tampering',
        title: 'Shape of Billing',
        description: 'About Billing.',
        likelihood: 'Medium',
        impact: 'High',
        mitigations: ['Validate every input.', 'Reject unexpected shapes.'],
        references: [],
        variant_group: 'p-shape-group',
      },
    ]);
  });

  it('gives a candidate a null variant group when the rule has none', () => {
    const library = load(process('p-always', undefined, [{}]));
    expect(library.candidatesFor(element())[0]?.variant_group).toBeNull();
  });

  it('freezes what it returns', () => {
    const library = load(process('p-always', undefined, [{}]));
    const candidates = library.candidatesFor(element());
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(Object.isFrozen(candidates[0])).toBe(true);
  });
});

describe('candidatesFor: data flows (scenarios 6 and 7)', () => {
  const library = load(
    dataFlow(
      'df-crossing',
      { flow: { crosses_trust_boundary: 'yes' } },
      [flowFact('yes')],
      [flowFact('no')],
    ),
    dataFlow(
      'df-internal',
      { flow: { crosses_trust_boundary: 'no' } },
      [flowFact('no')],
      [flowFact('yes')],
    ),
    dataFlow(
      'df-to-store',
      { flow: { target_type: 'data_store' } },
      [flowFact('no', 'process', 'data_store')],
      [flowFact('no')],
    ),
    dataFlow(
      'df-from-entity',
      { flow: { source_type: 'external_entity' } },
      [flowFact('no', 'external_entity')],
      [flowFact('no')],
    ),
    dataFlow(
      'df-all',
      {
        flags: { encrypted_in_transit: 'no' },
        flow: {
          crosses_trust_boundary: 'yes',
          source_type: 'external_entity',
          target_type: 'process',
        },
      },
      [flowFact('yes', 'external_entity', 'process')],
      [flowFact('no', 'external_entity', 'process')],
    ),
  );

  it('tells a flow that crosses a trust boundary from one that does not', () => {
    expect(ids(library, flowElement({}, { crosses_trust_boundary: true }))).toEqual([
      'df-crossing',
    ]);
    expect(ids(library, flowElement({}, { crosses_trust_boundary: false }))).toEqual([
      'df-internal',
    ]);
  });

  it('matches on the type of the target', () => {
    expect(ids(library, flowElement({}, { target_type: 'data_store' }))).toEqual([
      'df-internal',
      'df-to-store',
    ]);
    expect(ids(library, flowElement({}, { target_type: 'process' }))).toEqual(['df-internal']);
  });

  it('matches on the type of the source', () => {
    expect(ids(library, flowElement({}, { source_type: 'external_entity' }))).toEqual([
      'df-from-entity',
      'df-internal',
    ]);
  });

  it('needs the flags and the flow facts to hold together', () => {
    const context = {
      crosses_trust_boundary: true,
      source_type: 'external_entity',
      target_type: 'process',
    } as const;
    expect(ids(library, flowElement({}, context))).toContain('df-all');
    expect(
      ids(library, flowElement({ flags: { encrypted_in_transit: true } }, context)),
    ).not.toContain('df-all');
    expect(ids(library, flowElement({}, { ...context, target_type: 'data_store' }))).not.toContain(
      'df-all',
    );
  });
});

describe('candidatesFor: input it refuses (FR-016)', () => {
  const library = load(
    process('p-always', undefined, [{}]),
    dataFlow('df-any', undefined, [flowFact('no')]),
  );
  const bad = (input: unknown): LibraryInputError => {
    try {
      library.candidatesFor(input as ElementInput);
    } catch (error) {
      expect(error).toBeInstanceOf(LibraryInputError);
      return error as LibraryInputError;
    }
    throw new Error('expected a LibraryInputError');
  };

  it('refuses an unknown element type', () => {
    bad({ type: 'widget', name: 'x', properties: {} });
  });

  it('refuses a flag the type does not have, without repeating it', () => {
    const error = bad(flowElement({ flags: { encrypted_at_rest: true } }));
    expect(error.message).not.toContain('encrypted_at_rest');
  });

  it('refuses an unknown flag and an unknown properties key, without repeating them', () => {
    expect(bad(element({ properties: { flags: { sparkly: true } } })).message).not.toContain(
      'sparkly',
    );
    expect(bad(element({ properties: { glitter: 1 } })).message).not.toContain('glitter');
  });

  it('refuses properties that are not an object', () => {
    bad(element({ properties: 'nope' }));
    bad(element({ properties: null }));
  });

  it('refuses a data flow without its context', () => {
    bad({ type: 'data_flow', name: 'F', properties: {} });
  });

  it('refuses a context on anything but a data flow', () => {
    bad(element({ flow: flow() }));
  });

  it('refuses a context that is not valid', () => {
    bad(flowElement({}, { source_type: 'trust_boundary' as never }));
    bad(flowElement({}, { crosses_trust_boundary: 'yes' as never }));
    bad(flowElement({}, { source_name: 7 as never }));
    bad(flowElement({}, { target_name: undefined as never }));
  });

  it('refuses a name that is not a string', () => {
    bad(element({ name: 42 as never }));
  });

  it('returns nothing, not a partial answer, when it refuses', () => {
    expect(() =>
      library.candidatesFor(element({ properties: { flags: { sparkly: true } } })),
    ).toThrow();
  });
});
