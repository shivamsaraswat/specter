import { describe, expect, it } from 'vitest';
import { computeFlowContexts } from '../../src/rule-engine/flow-context.js';
import { element, flow } from './fixtures.js';

// Spec M2 FR-010b: a flow crosses a trust boundary when its two ends are not inside exactly the
// same set of boundaries.
describe('computeFlowContexts', () => {
  it('does not cross when neither end is in a boundary', () => {
    const a = element({ type: 'process' });
    const b = element({ type: 'data_store' });
    const f = flow(a, b);
    expect(computeFlowContexts([a, b, f]).get(f.id)?.crosses_trust_boundary).toBe(false);
  });

  it('does not cross between two nodes of the same boundary', () => {
    const boundary = element({ type: 'trust_boundary' });
    const a = element({ type: 'process', parent_boundary_id: boundary.id });
    const b = element({ type: 'data_store', parent_boundary_id: boundary.id });
    const f = flow(a, b);
    expect(computeFlowContexts([boundary, a, b, f]).get(f.id)?.crosses_trust_boundary).toBe(false);
  });

  it('does not cross between two nodes of the same innermost boundary of a nested pair', () => {
    const outer = element({ type: 'trust_boundary' });
    const inner = element({ type: 'trust_boundary', parent_boundary_id: outer.id });
    const a = element({ type: 'process', parent_boundary_id: inner.id });
    const b = element({ type: 'process', parent_boundary_id: inner.id });
    const f = flow(a, b);
    expect(computeFlowContexts([outer, inner, a, b, f]).get(f.id)?.crosses_trust_boundary).toBe(false);
  });

  it('crosses from outside to inside', () => {
    const boundary = element({ type: 'trust_boundary' });
    const outside = element({ type: 'external_entity' });
    const inside = element({ type: 'process', parent_boundary_id: boundary.id });
    const f = flow(outside, inside);
    expect(computeFlowContexts([boundary, outside, inside, f]).get(f.id)?.crosses_trust_boundary).toBe(true);
  });

  it('crosses between two sibling boundaries', () => {
    const left = element({ type: 'trust_boundary' });
    const right = element({ type: 'trust_boundary' });
    const a = element({ type: 'process', parent_boundary_id: left.id });
    const b = element({ type: 'process', parent_boundary_id: right.id });
    const f = flow(a, b);
    expect(computeFlowContexts([left, right, a, b, f]).get(f.id)?.crosses_trust_boundary).toBe(true);
  });

  it('crosses from an inner boundary to the boundary around it', () => {
    const outer = element({ type: 'trust_boundary' });
    const inner = element({ type: 'trust_boundary', parent_boundary_id: outer.id });
    const deep = element({ type: 'process', parent_boundary_id: inner.id });
    const shallow = element({ type: 'process', parent_boundary_id: outer.id });
    const f = flow(deep, shallow);
    expect(computeFlowContexts([outer, inner, deep, shallow, f]).get(f.id)?.crosses_trust_boundary).toBe(true);
  });

  it('carries the endpoint types and names', () => {
    const a = element({ type: 'external_entity', name: 'Customer' });
    const b = element({ type: 'data_store', name: 'Orders DB' });
    const f = flow(a, b);
    expect(computeFlowContexts([a, b, f]).get(f.id)).toEqual({
      crosses_trust_boundary: false,
      source_type: 'external_entity',
      target_type: 'data_store',
      source_name: 'Customer',
      target_name: 'Orders DB',
    });
  });

  it('gives only data flows an entry', () => {
    const a = element({ type: 'process' });
    const boundary = element({ type: 'trust_boundary' });
    expect([...computeFlowContexts([a, boundary]).keys()]).toEqual([]);
  });

  it('throws on a parent chain that loops instead of looping forever', () => {
    const one = element({ type: 'trust_boundary' });
    const two = element({ type: 'trust_boundary', parent_boundary_id: one.id });
    one.parent_boundary_id = two.id;
    const a = element({ type: 'process', parent_boundary_id: one.id });
    const b = element({ type: 'process' });
    expect(() => computeFlowContexts([one, two, a, b, flow(a, b)])).toThrow();
  });
});
