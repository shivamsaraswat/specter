import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_DEPTH, IMPORT_MAX_VALUES, checkBounds } from '../../src/index.js';

// The depth and value-count guard that runs before any schema walks a file (research #6, FR-020).

function nested(levels: number): unknown {
  let value: unknown = 1;
  for (let level = 0; level < levels; level += 1) value = { next: value };
  return value;
}

describe('checkBounds', () => {
  it('passes a plain object', () => {
    expect(checkBounds({ a: [1, 2, { b: 'c' }] })).toEqual({ ok: true });
  });

  it('allows nesting up to the depth limit and refuses one level more', () => {
    // The root is level 1: an object holding 63 further objects and a leaf is 64 deep.
    expect(checkBounds(nested(IMPORT_MAX_DEPTH - 1))).toEqual({ ok: true });
    expect(checkBounds(nested(IMPORT_MAX_DEPTH))).toEqual({ ok: false, message: 'file: nested more than 64 levels deep' });
  });

  it('counts the root, every array element and every object member value', () => {
    const exactly = new Array<number>(IMPORT_MAX_VALUES - 1).fill(0);
    expect(checkBounds(exactly)).toEqual({ ok: true });
    expect(checkBounds([...exactly, 0])).toEqual({ ok: false, message: 'file: has more than 2,000,000 values' });
    const members: Record<string, number> = {};
    for (let index = 0; index < IMPORT_MAX_VALUES; index += 1) members[`k${index}`] = 0;
    expect(checkBounds(members)).toEqual({ ok: false, message: 'file: has more than 2,000,000 values' });
  });

  it('walks a 1,000,000-deep nesting without recursing, and quickly', () => {
    let deep: unknown[] = [];
    for (let level = 0; level < 1_000_000; level += 1) deep = [deep];
    const started = performance.now();
    expect(checkBounds(deep)).toEqual({ ok: false, message: 'file: nested more than 64 levels deep' });
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('never repeats a key or value in its message', () => {
    const secret = 'secret-key-value';
    const result = checkBounds({ [secret]: nested(100) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain(secret);
  });
});
