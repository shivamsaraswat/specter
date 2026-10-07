import { describe, expect, it } from 'vitest';
import { INVALID_FLOW_MESSAGE, connectionProblem, newFlowAction } from './connect.js';
import { el, eid } from './test-helpers.js';

// FR-002, FR-003: a data flow joins two different external entities, processes or data stores.

const elements = [
  el(1, { type: 'external_entity' }),
  el(2, { type: 'process' }),
  el(3, { type: 'data_store' }),
  el(4, { type: 'trust_boundary', layout: { x: 0, y: 0, width: 300, height: 200 } }),
  el(5, { type: 'data_flow', layout: null, source_element_id: eid(1), target_element_id: eid(2) }),
];

describe('connectionProblem', () => {
  it.each([
    [1, 2],
    [2, 3],
    [3, 1],
    [2, 1],
  ])('allows a flow from %i to %i', (from, to) => {
    expect(connectionProblem(eid(from), eid(to), elements)).toBeNull();
  });

  it.each([
    ['the same node', 2, 2],
    ['a trust boundary as the target', 1, 4],
    ['a trust boundary as the source', 4, 1],
    ['a data flow as the target', 1, 5],
    ['a data flow as the source', 5, 1],
  ])('refuses %s, with the message', (_label, from, to) => {
    expect(connectionProblem(eid(from), eid(to), elements)).toBe(INVALID_FLOW_MESSAGE);
  });

  it('refuses a connection that ended on empty space', () => {
    expect(connectionProblem(eid(1), null, elements)).toBe(INVALID_FLOW_MESSAGE);
    expect(connectionProblem(null, eid(1), elements)).toBe(INVALID_FLOW_MESSAGE);
  });

  it('says what a flow must connect', () => {
    expect(INVALID_FLOW_MESSAGE).toBe('A data flow must connect two different external entities, processes or data stores.');
  });
});

describe('newFlowAction', () => {
  it('creates a data flow named "New data flow", with its own id and the two ends', () => {
    const action = newFlowAction(eid(1), eid(2));
    expect(action.ops).toHaveLength(1);
    const [op] = action.ops;
    expect(op).toMatchObject({
      op: 'create',
      element: { type: 'data_flow', name: 'New data flow', source_element_id: eid(1), target_element_id: eid(2) },
    });
    expect(op?.op === 'create' && op.element.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
