import { describe, expect, it } from 'vitest';
import { openThreatsText, sameEdge, sameNode, toFlowEdges, toFlowNodes } from './flow.js';
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

// Phase 2 / Milestone 4: what the canvas says about an element's open threats (spec FR-015, FR-017).
describe('open-threat counts reach what is drawn', () => {
  const api = el(4, { name: 'API', layout: { x: 30, y: 30 } });
  const db = el(5, { type: 'data_store', name: 'DB', layout: { x: 300, y: 30 } });
  const query = el(10, { type: 'data_flow', name: 'Query', layout: null, source_element_id: eid(4), target_element_id: eid(5) });
  const all = [api, db, query];
  const counts = new Map([
    [eid(4), 3],
    [eid(10), 1],
  ]);

  it('words a count in the singular and the plural', () => {
    expect(openThreatsText(1)).toBe('1 open threat');
    expect(openThreatsText(3)).toBe('3 open threats');
  });

  it('puts the count in a node\'s data, 0 when there is none, and names it in the accessible name only when above 0', () => {
    const [first, second] = toFlowNodes(all, undefined, counts).sort((a, b) => a.id.localeCompare(b.id));
    expect(first?.data.openThreats).toBe(3);
    expect(first?.ariaLabel).toBe('Process API, 3 open threats');
    expect(second?.data.openThreats).toBe(0);
    expect(second?.ariaLabel).toBe('Data store DB');
  });

  it('does the same for a data flow', () => {
    const [edge] = toFlowEdges(all, undefined, counts);
    expect(edge?.data?.openThreats).toBe(1);
    expect(edge?.ariaLabel).toBe('Data flow Query, from API to DB, 1 open threat');
    expect(toFlowEdges(all)[0]?.ariaLabel).toBe('Data flow Query, from API to DB');
  });

  it('defaults to no counts at all', () => {
    expect(toFlowNodes(all).every((node) => node.data.openThreats === 0)).toBe(true);
  });

  it('treats a changed count as a change, and an unchanged diagram as the same, so only what changed is redrawn', () => {
    const before = toFlowNodes(all, undefined, counts).find((n) => n.id === eid(4));
    const same = toFlowNodes(all, undefined, counts).find((n) => n.id === eid(4));
    const more = toFlowNodes(all, undefined, new Map([[eid(4), 4]])).find((n) => n.id === eid(4));
    if (!before || !same || !more) throw new Error('node missing');
    expect(sameNode(before, same)).toBe(true);
    expect(sameNode(before, more)).toBe(false);

    const edgeBefore = toFlowEdges(all, undefined, counts)[0];
    const edgeSame = toFlowEdges(all, undefined, counts)[0];
    const edgeMore = toFlowEdges(all, undefined, new Map([[eid(10), 2]]))[0];
    if (!edgeBefore || !edgeSame || !edgeMore) throw new Error('edge missing');
    expect(sameEdge(edgeBefore, edgeSame)).toBe(true);
    expect(sameEdge(edgeBefore, edgeMore)).toBe(false);
  });
});
