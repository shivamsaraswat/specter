import { describe, expect, it } from 'vitest';
import {
  NODE_SIZE,
  elementLayoutSchema,
  innermostContainer,
  toAbsolute,
  toRelative,
  type LayoutElement,
} from '../src/index.js';

describe('elementLayoutSchema', () => {
  it.each(['external_entity', 'process', 'data_store'] as const)('%s: null or {x, y}', (type) => {
    const schema = elementLayoutSchema(type);
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse({ x: 1, y: -2.5 }).success).toBe(true);
    expect(schema.safeParse({ x: 1 }).success).toBe(false);
    expect(schema.safeParse({ x: 1, y: 2, width: 100, height: 100 }).success).toBe(false);
    expect(schema.safeParse({ x: '1', y: 2 }).success).toBe(false);
    expect(schema.safeParse({ x: 1, y: 2, extra: true }).success).toBe(false);
  });

  it('trust_boundary: null or {x, y, width, height}', () => {
    const schema = elementLayoutSchema('trust_boundary');
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse({ x: 0, y: 0, width: 320, height: 220 }).success).toBe(true);
    expect(schema.safeParse({ x: 0, y: 0 }).success).toBe(false);
    expect(schema.safeParse({ x: 0, y: 0, width: 320 }).success).toBe(false);
  });

  it('data_flow: null only', () => {
    const schema = elementLayoutSchema('data_flow');
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse({ x: 0, y: 0 }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('enforces the ranges: x/y within ±100 000, width/height within 40 to 100 000, all finite', () => {
    const node = elementLayoutSchema('process');
    expect(node.safeParse({ x: 100_000, y: -100_000 }).success).toBe(true);
    expect(node.safeParse({ x: 100_001, y: 0 }).success).toBe(false);
    expect(node.safeParse({ x: 0, y: -100_001 }).success).toBe(false);
    expect(node.safeParse({ x: Number.NaN, y: 0 }).success).toBe(false);
    expect(node.safeParse({ x: Number.POSITIVE_INFINITY, y: 0 }).success).toBe(false);

    const boundary = elementLayoutSchema('trust_boundary');
    expect(boundary.safeParse({ x: 0, y: 0, width: 40, height: 40 }).success).toBe(true);
    expect(boundary.safeParse({ x: 0, y: 0, width: 39, height: 40 }).success).toBe(false);
    expect(boundary.safeParse({ x: 0, y: 0, width: 40, height: 39 }).success).toBe(false);
    expect(boundary.safeParse({ x: 0, y: 0, width: 100_000, height: 100_000 }).success).toBe(true);
    expect(boundary.safeParse({ x: 0, y: 0, width: 100_001, height: 40 }).success).toBe(false);
  });
});

describe('NODE_SIZE', () => {
  it('has a positive fixed size for each node type', () => {
    for (const type of ['external_entity', 'process', 'data_store'] as const) {
      expect(NODE_SIZE[type].width).toBeGreaterThan(0);
      expect(NODE_SIZE[type].height).toBeGreaterThan(0);
    }
  });
});

const boundary = (id: string, x: number, y: number, width: number, height: number, parent: string | null = null): LayoutElement => ({
  id,
  type: 'trust_boundary',
  parent_boundary_id: parent,
  layout: { x, y, width, height },
});
const node = (id: string, x: number, y: number, parent: string | null = null): LayoutElement => ({
  id,
  type: 'process',
  parent_boundary_id: parent,
  layout: { x, y },
});
const index = (...elements: LayoutElement[]) => new Map(elements.map((e) => [e.id, e]));

describe('toAbsolute / toRelative', () => {
  it('round-trips through two nested boundaries', () => {
    const outer = boundary('outer', 100, 50, 800, 600);
    const inner = boundary('inner', 40, 30, 300, 200, 'outer');
    const leaf = node('leaf', 10, 20, 'inner');
    const byId = index(outer, inner, leaf);

    expect(toAbsolute(leaf, byId)).toEqual({ x: 150, y: 100 });
    expect(toAbsolute(inner, byId)).toEqual({ x: 140, y: 80 });
    expect(toAbsolute(outer, byId)).toEqual({ x: 100, y: 50 });

    const parent = toAbsolute(inner, byId);
    expect(toRelative({ x: 150, y: 100 }, parent)).toEqual({ x: 10, y: 20 });
    expect(toRelative({ x: 150, y: 100 }, null)).toEqual({ x: 150, y: 100 });
  });

  it('returns null for an element with no layout', () => {
    expect(toAbsolute({ id: 'n', type: 'process', parent_boundary_id: null, layout: null }, index())).toBeNull();
  });
});

describe('innermostContainer', () => {
  const outer = boundary('outer', 0, 0, 1000, 800);
  const inner = boundary('inner', 100, 100, 400, 300, 'outer');
  const other = boundary('other', 2000, 0, 300, 300);
  const byId = index(outer, inner, other);
  const boundaries = [outer, inner, other];
  const rect = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

  it('picks the innermost boundary that wholly contains the rectangle', () => {
    expect(innermostContainer(rect(150, 150, 100, 60), boundaries, byId, new Set())).toBe('inner');
    expect(innermostContainer(rect(700, 500, 100, 60), boundaries, byId, new Set())).toBe('outer');
  });

  it('returns null when no boundary wholly contains it', () => {
    expect(innermostContainer(rect(1500, 100, 100, 60), boundaries, byId, new Set())).toBeNull();
  });

  it('does not nest on a partial overlap', () => {
    expect(innermostContainer(rect(450, 150, 100, 60), boundaries, byId, new Set())).toBe('outer');
    expect(innermostContainer(rect(950, 100, 100, 60), boundaries, byId, new Set())).toBeNull();
  });

  it('counts a rectangle that touches an edge as inside', () => {
    expect(innermostContainer(rect(100, 100, 400, 300), boundaries, byId, new Set())).toBe('inner');
  });

  it('skips excluded ids (the element itself and its descendants)', () => {
    expect(innermostContainer(rect(150, 150, 100, 60), boundaries, byId, new Set(['inner']))).toBe('outer');
    expect(innermostContainer(rect(150, 150, 100, 60), boundaries, byId, new Set(['inner', 'outer']))).toBeNull();
  });
});
