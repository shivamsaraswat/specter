import { describe, expect, it } from 'vitest';
import { toFlowNodes } from './flow.js';
import { eid, el } from './test-helpers.js';

// The order React Flow is given is the order things are drawn in, so it must not depend on the order the
// server happened to return the elements in (elements created together come back in the order of their
// random ids). A boundary must never be drawn over one inside it, where it would swallow its label.

const vpc = el(1, { type: 'trust_boundary', layout: { x: 0, y: 0, width: 700, height: 500 } });
const subnet = el(2, { type: 'trust_boundary', layout: { x: 100, y: 100, width: 260, height: 200 } });
const nested = el(3, { type: 'trust_boundary', layout: { x: 10, y: 10, width: 100, height: 100 }, parent_boundary_id: eid(1) });
const member = el(4, { layout: { x: 30, y: 30 }, parent_boundary_id: eid(1) });
const loose = el(5, { layout: { x: 900, y: 0 } });

const orderOf = (elements: ReturnType<typeof el>[]) => toFlowNodes(elements).map((node) => node.id);

describe('toFlowNodes order', () => {
  it('draws a larger boundary before a smaller one that overlaps it, so the smaller is on top', () => {
    const order = orderOf([vpc, subnet]);
    expect(order).toEqual([eid(1), eid(2)]);
  });

  it('puts every parent before what it holds, and boundaries before the nodes beside them', () => {
    const order = orderOf([member, loose, nested, subnet, vpc]);
    expect(order.indexOf(eid(1))).toBeLessThan(order.indexOf(eid(3)));
    expect(order.indexOf(eid(1))).toBeLessThan(order.indexOf(eid(4)));
    const boundaries = [eid(1), eid(2)].map((id) => order.indexOf(id));
    expect(Math.max(...boundaries)).toBeLessThan(order.indexOf(eid(5)));
  });

  it.each([
    [[vpc, subnet, nested, member, loose]],
    [[loose, member, nested, subnet, vpc]],
    [[subnet, vpc, member, loose, nested]],
    [[nested, loose, vpc, member, subnet]],
  ])('is the same whatever order the elements arrive in (%#)', (elements) => {
    expect(orderOf(elements)).toEqual(orderOf([vpc, subnet, nested, member, loose]));
  });

  it('gives a member boundary the parent React Flow needs, and leaves a missing parent out', () => {
    const [first, second] = toFlowNodes([vpc, nested]);
    expect(first?.parentId).toBeUndefined();
    expect(second?.parentId).toBe(eid(1));
    const orphan = toFlowNodes([el(9, { parent_boundary_id: eid(77) })])[0];
    expect(orphan?.parentId).toBeUndefined();
  });
});
