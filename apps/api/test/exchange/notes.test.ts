import { describe, expect, it } from 'vitest';
import { letters, matchStride, normalizeTags, note, shorten } from '../../src/exchange/import/notes.js';

// The helpers every planner of another tool's file uses (research #12, #13).

describe('note', () => {
  it('builds a note and leaves out what is not given', () => {
    expect(note('file.a.0', 'not_imported.asset')).toEqual({ path: 'file.a.0', kind: 'not_imported.asset' });
    expect(note('file.a.0', 'mapped.status', 'Title', 'accepted')).toEqual({
      path: 'file.a.0',
      kind: 'mapped.status',
      label: 'Title',
      detail: 'accepted',
    });
    expect(Object.keys(note('p', 'adjusted.tags', undefined, 'd'))).toEqual(['path', 'kind', 'detail']);
  });
});

describe('shorten', () => {
  it('leaves text within the limit alone', () => {
    expect(shorten('abc', 3)).toEqual({ text: 'abc', cut: false });
  });

  it('cuts at max - 1 code points and ends with an ellipsis, trimming the end before it', () => {
    expect(shorten('abcdef', 4)).toEqual({ text: 'abc…', cut: true });
    expect(shorten('ab    cdef', 5)).toEqual({ text: 'ab…', cut: true });
  });

  it('counts code points, so an emoji is one', () => {
    expect(shorten('😀😀😀', 3)).toEqual({ text: '😀😀😀', cut: false });
    expect(shorten('😀😀😀😀', 3)).toEqual({ text: '😀😀…', cut: true });
  });
});

describe('normalizeTags', () => {
  it('trims tags and drops empty ones without calling it a change', () => {
    expect(normalizeTags([' a ', '', '  ', 'b'])).toEqual({ tags: ['a', 'b'], changed: false });
  });

  it('merges tags that differ only by case, keeping the first, and reports it', () => {
    expect(normalizeTags(['Node.js', 'node.JS', 'Express'])).toEqual({ tags: ['Node.js', 'Express'], changed: true });
  });

  it('cuts a tag to 50 code points and reports it', () => {
    const result = normalizeTags(['x'.repeat(60)]);
    expect([...(result.tags[0] ?? '')]).toHaveLength(50);
    expect(result.changed).toBe(true);
  });

  it('caps the list at 20 tags and reports it', () => {
    const result = normalizeTags(Array.from({ length: 25 }, (_unused, index) => `tag${index}`));
    expect(result.tags).toHaveLength(20);
    expect(result.tags[19]).toBe('tag19');
    expect(result.changed).toBe(true);
  });

  it('gives an empty list for none', () => {
    expect(normalizeTags([])).toEqual({ tags: [], changed: false });
  });
});

describe('letters and matchStride', () => {
  it('keeps lower-case letters only', () => {
    expect(letters('Not-Applicable_1!')).toBe('notapplicable');
    expect(letters('N/A')).toBe('na');
  });

  it.each([
    ['Spoofing', 'Spoofing'],
    ['information disclosure', 'Information Disclosure'],
    ['Information_Disclosure', 'Information Disclosure'],
    ['Denial of service', 'Denial of Service'],
    ['ELEVATION OF PRIVILEGE', 'Elevation of Privilege'],
    ['Repudiation', 'Repudiation'],
    ['Tampering', 'Tampering'],
  ])('matches %j to %s', (value, expected) => {
    expect(matchStride(value)).toBe(expected);
  });

  it.each(['CWE-79', 'LINDDUN-L', '', 'Linkability'])('matches %j to nothing', (value) => {
    expect(matchStride(value)).toBeNull();
  });
});
