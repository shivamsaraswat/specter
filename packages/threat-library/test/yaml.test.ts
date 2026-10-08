import { describe, expect, it } from 'vitest';
import { parseYamlFile } from '../src/yaml.js';

const parseOk = (text: string): unknown => {
  const result = parseYamlFile('process/p-x.yaml', text, 'p-x');
  if (!('value' in result))
    throw new Error(`expected a value, got ${JSON.stringify(result.issues)}`);
  return result.value;
};

const issuesOf = (text: string) => {
  const result = parseYamlFile('process/p-x.yaml', text, 'p-x');
  if (!('issues' in result)) throw new Error('expected issues');
  return result.issues;
};

describe('parseYamlFile (research #3)', () => {
  it('reads yes and no as text, as the YAML 1.2 core schema does', () => {
    expect(parseOk('a: yes\nb: no\n')).toEqual({ a: 'yes', b: 'no' });
  });

  it('reads true and false as booleans, so the rule schema can reject them', () => {
    expect(parseOk('a: true\nb: false\n')).toEqual({ a: true, b: false });
  });

  it('keeps a date as text', () => {
    expect(parseOk('retired_on: 2026-10-08\n')).toEqual({ retired_on: '2026-10-08' });
  });

  it('keeps block scalars with their line breaks', () => {
    expect(parseOk('description: |\n  one\n  two\n')).toEqual({ description: 'one\ntwo\n' });
  });

  it('reports a duplicate key', () => {
    const [issue] = issuesOf('a: 1\na: 2\n');
    expect(issue).toMatchObject({ file: 'process/p-x.yaml', rule: 'p-x' });
    expect(issue?.message).toMatch(/unique|duplicate/i);
  });

  it('reports an anchor and an alias', () => {
    expect(
      issuesOf('a: &x 1\nb: *x\n')
        .map((i) => i.message)
        .join('\n'),
    ).toMatch(/anchor|alias/i);
    expect(issuesOf('a: &x 1\n').length).toBeGreaterThan(0);
  });

  it('reports an unknown tag, because parser warnings count as errors', () => {
    expect(issuesOf('a: !foo bar\n').length).toBeGreaterThan(0);
  });

  it('reports a file with two documents', () => {
    expect(issuesOf('a: 1\n---\nb: 2\n').length).toBeGreaterThan(0);
  });

  it('reports a syntax error, naming the file and the rule', () => {
    const [issue] = issuesOf('a: [1, 2\n');
    expect(issue).toMatchObject({ file: 'process/p-x.yaml', rule: 'p-x' });
  });

  it('says which line a syntax error is on', () => {
    const [issue] = issuesOf('id: p-x\ntitle: [one, two\nlikelihood: Low\n');
    expect(issue?.message).toMatch(/\(line \d+\)$/);
    expect(issue?.message.split('\n')).toHaveLength(1);
  });

  it('says which line a duplicate key is on', () => {
    const [issue] = issuesOf('a: 1\nb: 2\na: 3\n');
    expect(issue?.message).toContain('(line 3)');
  });

  it('says which line an unresolved tag is on', () => {
    const [issue] = issuesOf('a: 1\nb: !foo bar\n');
    expect(issue?.message).toContain('(line 2)');
  });

  it('tells the author that a rule file holds one document, without naming the parser', () => {
    const [issue] = issuesOf('a: 1\n---\nb: 2\n');
    expect(issue?.message).toContain('---');
    expect(issue?.message).toContain('one rule');
    expect(issue?.message).not.toContain('parseAllDocuments');
  });

  it('gives a null rule when the caller has none', () => {
    const result = parseYamlFile('ids.yaml', 'a: [', null);
    expect('issues' in result && result.issues[0]?.rule).toBeNull();
  });
});
