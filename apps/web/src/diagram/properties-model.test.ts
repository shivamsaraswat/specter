import { describe, expect, it } from 'vitest';
import { buildProperties, carryFlags, flagState, splitProperties, withFlag } from './properties-model.js';

describe('splitProperties', () => {
  it('reads tags and the flags the type has', () => {
    expect(splitProperties('data_store', { tags: ['PostgreSQL 16'], flags: { encrypted_at_rest: false, internet_facing: true } })).toEqual({
      tags: ['PostgreSQL 16'],
      flags: { encrypted_at_rest: false, internet_facing: true },
      other: [],
    });
  });

  it('reports everything else as other, without losing the rest', () => {
    const result = splitProperties('process', { tags: ['nginx'], color: 'red', flags: { runs_privileged: true, encrypted_at_rest: true, shiny: 1 } });
    expect(result.tags).toEqual(['nginx']);
    expect(result.flags).toEqual({ runs_privileged: true });
    expect(result.other.sort()).toEqual(['color', 'flags.encrypted_at_rest', 'flags.shiny']);
  });

  it('reports tags or flags of the wrong shape', () => {
    expect(splitProperties('process', { tags: 'nginx', flags: [] }).other.sort()).toEqual(['flags', 'tags']);
    expect(splitProperties('process', { tags: [1, 2] }).other).toEqual(['tags']);
  });

  it('knows nothing of a trust boundary’s flags', () => {
    expect(splitProperties('trust_boundary', { flags: { internet_facing: true } }).other).toEqual(['flags.internet_facing']);
  });
});

describe('buildProperties', () => {
  it('leaves out what is empty, so nothing assessed is {}', () => {
    expect(buildProperties({ tags: [], flags: {} })).toEqual({});
    expect(buildProperties({ tags: ['a'], flags: {} })).toEqual({ tags: ['a'] });
    expect(buildProperties({ tags: [], flags: { authenticated: false } })).toEqual({ flags: { authenticated: false } });
  });
});

describe('flags', () => {
  it('tells yes, no and not assessed apart', () => {
    expect([flagState(true), flagState(false), flagState(undefined)]).toEqual(['yes', 'no', 'unset']);
  });

  it('sets a flag, changes it, and clears it for not assessed, without touching the others', () => {
    const start = { a: true, b: false };
    expect(withFlag(start, 'c', 'yes')).toEqual({ a: true, b: false, c: true });
    expect(withFlag(start, 'a', 'no')).toEqual({ a: false, b: false });
    expect(withFlag(start, 'b', 'unset')).toEqual({ a: true });
    expect(start).toEqual({ a: true, b: false });
  });

  it('keeps the flags a new type has and loses the others, naming only the ones lost', () => {
    const flags = { internet_facing: true, runs_privileged: false, handles_sensitive_data: true };
    const { kept, lost } = carryFlags(flags, 'data_store');
    expect(kept).toEqual({ internet_facing: true });
    expect(lost.sort()).toEqual(['handles_sensitive_data', 'runs_privileged']);
    expect(carryFlags({}, 'data_store')).toEqual({ kept: {}, lost: [] });
  });
});
