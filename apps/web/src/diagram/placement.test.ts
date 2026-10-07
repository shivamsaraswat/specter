import { NODE_SIZE, type ElementRecord } from '@specter/core';
import { describe, expect, it } from 'vitest';
import { freeSpotNear, resolveLayout, type Resolved } from './placement.js';
import { el, eid } from './test-helpers.js';

// Elements without a usable layout are drawn at a place chosen here; nothing is saved by it
// (research #12, FR-020c, SC-007).

const size = (e: ElementRecord) => (e.type === 'trust_boundary' ? { width: 320, height: 220 } : NODE_SIZE[e.type as 'process']);
const overlaps = (a: Resolved & { width: number; height: number }, b: Resolved & { width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function rects(elements: ElementRecord[], layout: Map<string, Resolved>) {
  return elements.map((e) => {
    const at = layout.get(e.id);
    expect(at, `a position for ${e.name}`).toBeDefined();
    return { id: e.id, x: at?.x ?? 0, y: at?.y ?? 0, width: at?.width ?? size(e).width, height: at?.height ?? size(e).height };
  });
}

describe('resolveLayout', () => {
  it('keeps the stored position of an element that has one', () => {
    const layout = resolveLayout([el(1, { layout: { x: 120, y: 80 } })]);
    expect(layout.get(eid(1))).toMatchObject({ x: 120, y: 80 });
  });

  it('places elements with a null layout, or a layout that is not valid for their type, on a grid', () => {
    const elements = [
      el(1, { layout: { x: 0, y: 0 } }),
      el(2, { layout: null }),
      el(3, { layout: null }),
      el(4, { layout: { anything: 1 } }),
      el(5, { type: 'trust_boundary', layout: null }),
    ];
    const layout = resolveLayout(elements);
    const boxes = rects(elements, layout);

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        expect(overlaps(boxes[i] as never, boxes[j] as never), `${boxes[i]?.id} overlaps ${boxes[j]?.id}`).toBe(false);
      }
    }
  });

  it('places 20 unplaced elements without any overlap (SC-007)', () => {
    const elements = Array.from({ length: 20 }, (_, i) => el(i + 1, { layout: null }));
    const boxes = rects(elements, resolveLayout(elements));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) expect(overlaps(boxes[i] as never, boxes[j] as never)).toBe(false);
    }
  });

  it('places the members of a boundary inside its area', () => {
    const boundary = el(1, { type: 'trust_boundary', layout: { x: 100, y: 100, width: 600, height: 400 } });
    const members = [2, 3, 4].map((n) => el(n, { layout: null, parent_boundary_id: eid(1) }));
    const layout = resolveLayout([boundary, ...members]);
    for (const member of members) {
      const at = layout.get(member.id);
      expect(at?.x).toBeGreaterThanOrEqual(0);
      expect(at?.y).toBeGreaterThanOrEqual(0);
      expect((at?.x ?? 0) + NODE_SIZE.process.width).toBeLessThanOrEqual(600);
      expect((at?.y ?? 0) + NODE_SIZE.process.height).toBeLessThanOrEqual(400);
    }
  });

  it('draws a member whose stored position lies outside its boundary inside it: stored membership wins', () => {
    const boundary = el(1, { type: 'trust_boundary', layout: { x: 0, y: 0, width: 300, height: 200 } });
    const stray = el(2, { layout: { x: 5000, y: -900 }, parent_boundary_id: eid(1) });
    const layout = resolveLayout([boundary, stray]);
    const at = layout.get(eid(2));
    expect(at?.x).toBeGreaterThanOrEqual(0);
    expect((at?.x ?? 0) + NODE_SIZE.process.width).toBeLessThanOrEqual(300);
    expect(at?.y).toBeGreaterThanOrEqual(0);
    expect((at?.y ?? 0) + NODE_SIZE.process.height).toBeLessThanOrEqual(200);
  });

  it('does not change the element: it only reports where to draw it', () => {
    const elements = [el(1, { layout: null })];
    const before = JSON.stringify(elements);
    resolveLayout(elements);
    expect(JSON.stringify(elements)).toBe(before);
  });

  it('gives an unplaced boundary a default size', () => {
    const at = resolveLayout([el(1, { type: 'trust_boundary', layout: null })]).get(eid(1));
    expect(at?.width).toBeGreaterThan(0);
    expect(at?.height).toBeGreaterThan(0);
  });
});

describe('freeSpotNear', () => {
  const box = NODE_SIZE.process;

  it('uses the centre itself when nothing is there', () => {
    const spot = freeSpotNear({ x: 500, y: 300 }, [], box);
    expect(spot.x + box.width / 2).toBeCloseTo(500);
    expect(spot.y + box.height / 2).toBeCloseTo(300);
  });

  it('moves to a nearby free spot when the centre is taken', () => {
    const taken = [{ x: 500 - box.width / 2, y: 300 - box.height / 2, ...box }];
    const spot = freeSpotNear({ x: 500, y: 300 }, taken, box);
    expect(overlaps({ ...spot, ...box }, taken[0] as never)).toBe(false);
    expect(Math.hypot(spot.x - taken[0]!.x, spot.y - taken[0]!.y)).toBeLessThan(500);
  });
});
