import { describe, expect, it } from 'vitest';
import { SELF_CONTAINMENT_MESSAGE, moveElements, resizeBoundary, type MembershipResult } from './membership.js';
import type { BatchOp } from './operations.js';
import { eid, el } from './test-helpers.js';

// FR-008 to FR-011, research #13: which boundary an element belongs to follows where it is drawn. Every
// change here is one action's operations.

const boundary = (n: number, x: number, y: number, width: number, height: number, parent: number | null = null) =>
  el(n, { type: 'trust_boundary', name: `Boundary ${n}`, layout: { x, y, width, height }, parent_boundary_id: parent === null ? null : eid(parent) });
const node = (n: number, x: number, y: number, parent: number | null = null) =>
  el(n, { type: 'process', name: `Node ${n}`, layout: { x, y }, parent_boundary_id: parent === null ? null : eid(parent) });

function opsOf(result: MembershipResult): BatchOp[] {
  expect(result.kind, JSON.stringify(result)).toBe('changes');
  return result.kind === 'changes' ? result.action.ops : [];
}
const updateOf = (ops: BatchOp[], n: number) => {
  const op = ops.find((candidate) => candidate.op === 'update' && candidate.id === eid(n));
  return op?.op === 'update' ? op.changes : undefined;
};

describe('dropping an element (US2 scenarios 2 and 3)', () => {
  const vpc = boundary(1, 100, 100, 600, 400);

  it('makes a node that is wholly inside a boundary a member, at a position relative to it', () => {
    const ops = opsOf(moveElements([vpc, node(2, 0, 0)], [{ id: eid(2), position: { x: 150, y: 160 } }]));
    expect(updateOf(ops, 2)).toEqual({ parent_boundary_id: eid(1), layout: { x: 50, y: 60 } });
  });

  it('takes it out again when it is dragged out, keeping its place on the diagram', () => {
    const member = node(2, 50, 50, 1);
    const ops = opsOf(moveElements([vpc, member], [{ id: eid(2), position: { x: -300, y: 20 } }]));
    // Relative to the boundary at (100, 100), -300 and 20 are -200 and 120 on the diagram.
    expect(updateOf(ops, 2)).toEqual({ parent_boundary_id: null, layout: { x: -200, y: 120 } });
  });

  it('saves only the new position when the element stays in the same boundary', () => {
    const ops = opsOf(moveElements([vpc, node(2, 50, 50, 1)], [{ id: eid(2), position: { x: 80, y: 90 } }]));
    expect(updateOf(ops, 2)).toEqual({ layout: { x: 80, y: 90 } });
  });

  it('chooses the innermost of nested boundaries', () => {
    const outer = boundary(1, 0, 0, 1000, 800);
    const inner = boundary(2, 100, 100, 400, 300, 1);
    const ops = opsOf(moveElements([outer, inner, node(3, 700, 600)], [{ id: eid(3), position: { x: 150, y: 150 } }]));
    expect(updateOf(ops, 3)).toMatchObject({ parent_boundary_id: eid(2), layout: { x: 50, y: 50 } });
    const ops2 = opsOf(moveElements([outer, inner, node(3, 150, 150, 2)], [{ id: eid(3), position: { x: 600, y: 500 } }]));
    // (600, 500) is relative to the inner boundary it was in, which is (700, 600) on the diagram: out of
    // the inner boundary, but still inside the outer one.
    expect(updateOf(ops2, 3)).toMatchObject({ parent_boundary_id: eid(1), layout: { x: 700, y: 600 } });
  });

  it('does not nest an element that only partly overlaps a boundary', () => {
    const result = moveElements([vpc, node(2, 0, 0)], [{ id: eid(2), position: { x: 650, y: 150 } }]);
    const ops = opsOf(result);
    expect(updateOf(ops, 2)).toEqual({ layout: { x: 650, y: 150 } });
  });

  it('saves nothing for a move that changes nothing', () => {
    expect(moveElements([vpc, node(2, 40, 40)], [{ id: eid(2), position: { x: 40, y: 40 } }])).toEqual({ kind: 'none' });
  });

  it('rounds positions to whole units', () => {
    const ops = opsOf(moveElements([vpc, node(2, 0, 0)], [{ id: eid(2), position: { x: 12.4, y: 7.6 } }]));
    expect(updateOf(ops, 2)).toEqual({ layout: { x: 12, y: 8 } });
  });

  it('puts a boundary dropped inside another into it, as a nested boundary', () => {
    const ops = opsOf(moveElements([boundary(1, 0, 0, 800, 600), boundary(2, 1000, 0, 200, 150)], [{ id: eid(2), position: { x: 100, y: 100 } }]));
    expect(updateOf(ops, 2)).toEqual({ parent_boundary_id: eid(1), layout: { x: 100, y: 100, width: 200, height: 150 } });
  });
});

describe('moving a boundary (US2 scenario 4)', () => {
  it('saves the boundary alone: what it contains keeps its place inside it', () => {
    const elements = [boundary(1, 0, 0, 600, 400), node(2, 50, 50, 1), boundary(3, 300, 100, 200, 200, 1), node(4, 20, 20, 3)];
    const ops = opsOf(moveElements(elements, [{ id: eid(1), position: { x: 500, y: 300 } }]));
    expect(ops).toHaveLength(1);
    expect(updateOf(ops, 1)).toEqual({ layout: { x: 500, y: 300, width: 600, height: 400 } });
  });

  it('makes a top-level node that the boundary now covers a member of it', () => {
    const elements = [boundary(1, 0, 0, 300, 200), node(2, 1000, 1000)];
    const ops = opsOf(moveElements(elements, [{ id: eid(1), position: { x: 900, y: 900 } }]));
    expect(updateOf(ops, 1)).toEqual({ layout: { x: 900, y: 900, width: 300, height: 200 } });
    expect(updateOf(ops, 2)).toEqual({ parent_boundary_id: eid(1), layout: { x: 100, y: 100 } });
  });
});

describe('resizing a boundary (US2 scenario 5)', () => {
  it('takes out a member that the smaller boundary no longer holds, and into the next boundary that does', () => {
    const outer = boundary(1, 0, 0, 1000, 800);
    const inner = boundary(2, 100, 100, 600, 400, 1);
    const member = node(3, 450, 300, 2);
    const ops = opsOf(resizeBoundary([outer, inner, member], eid(2), { x: 100, y: 100, width: 300, height: 200 }));
    expect(updateOf(ops, 2)).toEqual({ layout: { x: 100, y: 100, width: 300, height: 200 } });
    expect(updateOf(ops, 3)).toEqual({ parent_boundary_id: eid(1), layout: { x: 550, y: 400 } });
  });

  it('takes in an element that the larger boundary now holds', () => {
    const elements = [boundary(1, 0, 0, 300, 200), node(2, 400, 50)];
    const ops = opsOf(resizeBoundary(elements, eid(1), { x: 0, y: 0, width: 800, height: 400 }));
    expect(updateOf(ops, 1)).toEqual({ layout: { x: 0, y: 0, width: 800, height: 400 } });
    expect(updateOf(ops, 2)).toEqual({ parent_boundary_id: eid(1), layout: { x: 400, y: 50 } });
  });

  it('keeps the position of a boundary resized from its top or left edge, and of what it holds', () => {
    const elements = [boundary(1, 100, 100, 400, 300), node(2, 50, 50, 1)];
    const ops = opsOf(resizeBoundary(elements, eid(1), { x: 60, y: 80, width: 440, height: 320 }));
    expect(updateOf(ops, 1)).toEqual({ layout: { x: 60, y: 80, width: 440, height: 320 } });
    // The member's place on the diagram moved with the corner, so its stored position is converted.
    expect(updateOf(ops, 2)).toEqual({ layout: { x: 90, y: 70 } });
  });
});

describe('a boundary can never contain itself (FR-010, US2 scenario 7)', () => {
  it('refuses to drop a boundary into its own descendant, saving nothing', () => {
    // A descendant that is larger than the boundary holding it, as an API client can store.
    const outer = boundary(1, 0, 0, 100, 100);
    const huge = boundary(2, 0, 0, 2000, 2000, 1);
    const result = moveElements([outer, huge], [{ id: eid(1), position: { x: 10, y: 10 } }]);
    expect(result).toEqual({ kind: 'refused', message: SELF_CONTAINMENT_MESSAGE });
  });

  it('says what it refused', () => {
    expect(SELF_CONTAINMENT_MESSAGE).toBe("A trust boundary can't contain itself.");
  });
});

describe('one action', () => {
  it('puts every change of one drag in the same action', () => {
    const elements = [boundary(1, 0, 0, 300, 200), node(2, 1000, 1000), node(3, 5000, 5000)];
    const result = moveElements(elements, [
      { id: eid(1), position: { x: 900, y: 900 } },
      { id: eid(3), position: { x: 5100, y: 5100 } },
    ]);
    expect(result.kind).toBe('changes');
    if (result.kind === 'changes') {
      expect(result.action.ops.map((op) => (op.op === 'update' ? op.id : ''))).toEqual(expect.arrayContaining([eid(1), eid(2), eid(3)]));
      expect(result.action.label).toBeTruthy();
    }
  });
});
