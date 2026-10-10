import { describe, expect, it } from 'vitest';
import { sortElements, sortMitigations, sortThreats } from '../../src/exchange/order.js';

// The content order of an export (research #3, data-model.md "Export order"): by what a record is, never by when it
// was stored, because every row one import inserts has the same created_at.

type Kind = 'trust_boundary' | 'external_entity' | 'process' | 'data_store' | 'data_flow';
const element = (id: string, type: Kind, name: string, created_at = '2026-10-10T00:00:00.000Z') => ({ id, type, name, created_at });
const threat = (id: string, element_id: string | null, category: string, title: string, created_at = '2026-10-10T00:00:00.000Z') => ({
  id,
  element_id,
  category,
  title,
  created_at,
});
const mitigation = (id: string, threat_id: string, description: string) => ({ id, threat_id, description });

// A small deterministic shuffle, so the test needs no random source.
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed;
  for (let index = out.length - 1; index > 0; index -= 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const other = state % (index + 1);
    [out[index], out[other]] = [out[other] as T, out[index] as T];
  }
  return out;
}

describe('sortElements', () => {
  const elements = [
    element('f1', 'data_flow', 'SQL'),
    element('d1', 'data_store', 'Orders DB'),
    element('p1', 'process', 'API'),
    element('e1', 'external_entity', 'Browser'),
    element('b1', 'trust_boundary', 'VPC'),
    element('p2', 'process', 'Batch'),
  ];

  it('orders by kind (boundaries, entities, processes, stores, flows), then name', () => {
    expect(sortElements(elements).sorted.map((item) => item.id)).toEqual(['b1', 'e1', 'p1', 'p2', 'd1', 'f1']);
  });

  it('compares names by code point, not by locale', () => {
    const names = sortElements([element('a', 'process', 'a'), element('z', 'process', 'Z'), element('f', 'process', 'f'), element('e', 'process', 'é')]);
    // 'Z' (U+005A) < 'a' (U+0061) < 'f' (U+0066) < 'é' (U+00E9); localeCompare would put 'é' before 'f'.
    expect(names.sorted.map((item) => item.name)).toEqual(['Z', 'a', 'f', 'é']);
  });

  it('breaks every tie by id', () => {
    const tied = sortElements([element('b', 'process', 'Worker'), element('a', 'process', 'Worker')]);
    expect(tied.sorted.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('gives the same result whatever the input order, and ignores created_at', () => {
    const stamped = elements.map((item, index) => ({ ...item, created_at: `2026-10-10T00:00:0${index}.000Z` }));
    const expected = sortElements(elements).sorted.map((item) => item.id);
    for (const seed of [1, 2, 3, 4, 5]) {
      expect(sortElements(shuffled(stamped, seed)).sorted.map((item) => item.id)).toEqual(expected);
    }
  });

  it('returns the position of each element, and does not change its input', () => {
    const input = [...elements];
    const { sorted, position } = sortElements(input);
    expect(input).toEqual(elements);
    expect(position.get('b1')).toBe(0);
    expect(position.get(sorted[3]?.id ?? '')).toBe(3);
  });
});

describe('sortThreats', () => {
  const position = new Map([
    ['b1', 0],
    ['p1', 1],
  ]);
  const threats = [
    threat('t5', null, 'Spoofing', 'Model level'),
    threat('t4', 'p1', 'Tampering', 'B'),
    threat('t3', 'p1', 'Spoofing', 'Z'),
    threat('t2', 'p1', 'Spoofing', 'A'),
    threat('t1', 'b1', 'Denial of Service', 'First'),
  ];

  it('orders by element position (model-level threats last), then STRIDE category, then title', () => {
    expect(sortThreats(threats, position).sorted.map((item) => item.id)).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });

  it('puts categories in STRIDE order, not alphabetical order', () => {
    const sorted = sortThreats(
      [threat('x', 'p1', 'Elevation of Privilege', 'a'), threat('y', 'p1', 'Information Disclosure', 'a'), threat('z', 'p1', 'Repudiation', 'a')],
      position,
    );
    expect(sorted.sorted.map((item) => item.category)).toEqual(['Repudiation', 'Information Disclosure', 'Elevation of Privilege']);
  });

  it('breaks ties by id and ignores input order and created_at', () => {
    const tied = [threat('b', 'p1', 'Spoofing', 'Same', '2026-01-01T00:00:00.000Z'), threat('a', 'p1', 'Spoofing', 'Same', '2026-12-01T00:00:00.000Z')];
    expect(sortThreats(tied, position).sorted.map((item) => item.id)).toEqual(['a', 'b']);
    const expected = sortThreats(threats, position).sorted.map((item) => item.id);
    for (const seed of [1, 2, 3]) expect(sortThreats(shuffled(threats, seed), position).sorted.map((item) => item.id)).toEqual(expected);
  });

  it('returns the position of each threat', () => {
    const result = sortThreats(threats, position);
    expect(result.position.get('t1')).toBe(0);
    expect(result.position.get('t5')).toBe(4);
  });
});

describe('sortMitigations', () => {
  const threatPosition = new Map([
    ['t1', 0],
    ['t2', 1],
  ]);
  it('orders by the position of the threat, then description, then id', () => {
    const sorted = sortMitigations(
      [mitigation('m4', 't2', 'a'), mitigation('m3', 't1', 'b'), mitigation('m2', 't1', 'a'), mitigation('m1', 't1', 'a')],
      threatPosition,
    );
    expect(sorted.map((item) => item.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });
});
