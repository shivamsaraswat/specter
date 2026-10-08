import { describe, expect, it } from 'vitest';
import { parseLibrary } from '../src/index.js';
import { files, ruleFile } from './helpers.js';

const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const processLibrary = (overrides: Record<string, unknown> = {}) =>
  parseLibrary(
    files(
      ruleFile('process', {
        id: 'p-text',
        title: 'Tampering with {{element}}',
        description: '{{element}} accepts input.',
        when: undefined,
        examples: { applies: [{}] },
        ...overrides,
      }),
    ),
  );

const candidate = (name: string, overrides: Record<string, unknown> = {}) => {
  const [first] = processLibrary(overrides).candidatesFor({
    type: 'process',
    name,
    properties: {},
  });
  if (!first) throw new Error('expected a candidate');
  return first;
};

describe('placeholders (FR-004a)', () => {
  it('fills the element name into the title and the description', () => {
    const result = candidate('Payment Gateway');
    expect(result.title).toBe('Tampering with Payment Gateway');
    expect(result.description).toBe('Payment Gateway accepts input.');
  });

  it('gives two elements texts that differ only by name (US1 scenario 8)', () => {
    const a = candidate('Payment Gateway');
    const b = candidate('Admin');
    expect(a.title.replace('Payment Gateway', '#')).toBe(b.title.replace('Admin', '#'));
    expect(a.description.replace('Payment Gateway', '#')).toBe(b.description.replace('Admin', '#'));
  });

  it('fills every occurrence', () => {
    const result = candidate('X', { description: '{{element}} and {{element}} again.' });
    expect(result.description).toBe('X and X again.');
  });

  it('fills the source and the target of a data flow', () => {
    const library = parseLibrary(
      files(
        ruleFile('data_flow', {
          when: undefined,
          examples: {
            applies: [
              {
                flow: {
                  crosses_trust_boundary: 'yes',
                  source_type: 'external_entity',
                  target_type: 'process',
                },
              },
            ],
          },
        }),
      ),
    );
    const [result] = library.candidatesFor({
      type: 'data_flow',
      name: 'Card details',
      properties: {},
      flow: {
        crosses_trust_boundary: true,
        source_type: 'external_entity',
        target_type: 'process',
        source_name: 'Shopper',
        target_name: 'Checkout API',
      },
    });
    expect(result?.title).toBe('Test: Shopper to Checkout API readable in transit');
    expect(result?.description).toBe(
      'Card details carries data from Shopper to Checkout API in plaintext.',
    );
  });

  it('inserts a name that looks like a placeholder literally, once', () => {
    expect(candidate('{{element}}').title).toBe('Tampering with {{element}}');
    expect(candidate('{{source}}').title).toBe('Tampering with {{source}}');
  });

  it('inserts a name with replacement patterns literally', () => {
    expect(candidate('$& $1 $$ $`').title).toBe('Tampering with $& $1 $$ $`');
  });

  it('leaves text without placeholders alone', () => {
    expect(candidate('X', { title: 'Plain title', description: 'Plain description.' }).title).toBe(
      'Plain title',
    );
  });
});

describe('shortening to the threat limits (FR-004b)', () => {
  it('cuts a title over 200 code points to 200, ending in an ellipsis', () => {
    const title = candidate('x'.repeat(300)).title;
    expect([...title]).toHaveLength(200);
    expect(title.endsWith('…')).toBe(true);
    expect(title.startsWith('Tampering with xxx')).toBe(true);
  });

  it('cuts a description over 10,000 code points the same way', () => {
    const description = candidate('y'.repeat(10_050)).description;
    expect([...description]).toHaveLength(10_000);
    expect(description.endsWith('…')).toBe(true);
  });

  it('leaves text of exactly the limit unchanged', () => {
    const name = 'x'.repeat(200 - 'Tampering with '.length);
    const title = candidate(name).title;
    expect([...title]).toHaveLength(200);
    expect(title.endsWith('…')).toBe(false);
  });

  it('never splits a surrogate pair', () => {
    const title = candidate('😀'.repeat(300)).title;
    expect(lone.test(title)).toBe(false);
    expect([...title]).toHaveLength(200);
    expect(title.endsWith('…')).toBe(true);
    const description = candidate('😀'.repeat(10_050)).description;
    expect(lone.test(description)).toBe(false);
    expect([...description]).toHaveLength(10_000);
  });

  it('trims whitespace left at the cut, before the ellipsis', () => {
    const name = `${'x'.repeat(180)}   ${'z'.repeat(50)}`;
    const title = candidate(name).title;
    expect(title.endsWith(' …')).toBe(false);
    expect(title.endsWith('…')).toBe(true);
    expect([...title].length).toBeLessThanOrEqual(200);
  });

  it('counts the limit in code points, not UTF-16 units', () => {
    const name = '😀'.repeat(80);
    const title = candidate(name).title; // 15 + 80 = 95 code points, 175 UTF-16 units: under the limit
    expect(title).toBe(`Tampering with ${name}`);
  });
});
