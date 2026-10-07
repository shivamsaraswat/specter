import { ReactFlowProvider, Position } from '@xyflow/react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlowEdge } from './FlowEdge.js';
import { toFlowEdges } from './flow.js';
import { el, eid } from './test-helpers.js';

const flow = (n: number, from: number, to: number, name = `Flow ${n}`) =>
  el(n, { type: 'data_flow', name, layout: null, source_element_id: eid(from), target_element_id: eid(to) });

function renderEdge(props: { id: string; label: string; curve: number; from: [number, number]; to: [number, number] }) {
  return render(
    <ReactFlowProvider>
      <svg>
        <FlowEdge
          {...({
            id: props.id,
            source: 'a',
            target: 'b',
            sourceX: props.from[0],
            sourceY: props.from[1],
            targetX: props.to[0],
            targetY: props.to[1],
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
            markerEnd: 'url(#arrow)',
            label: props.label,
            data: { curve: props.curve },
            selected: false,
            animated: false,
            interactionWidth: 20,
          })}
        />
      </svg>
    </ReactFlowProvider>,
  );
}

describe('FlowEdge (FR-004)', () => {
  it('draws an arrow from source to target with its name as the label', () => {
    const { container } = renderEdge({ id: 'e1', label: 'HTTPS', curve: 0, from: [100, 50], to: [400, 50] });

    const path = container.querySelector('path.react-flow__edge-path');
    expect(path?.getAttribute('marker-end')).toBe('url(#arrow)');
    expect(container.querySelector('text')?.textContent).toBe('HTTPS');
  });

  it('draws a flow with a curve offset on a different path from a straight one', () => {
    const straight = renderEdge({ id: 'e1', label: 'A', curve: 0, from: [100, 50], to: [400, 50] });
    const curved = renderEdge({ id: 'e2', label: 'A', curve: 40, from: [100, 50], to: [400, 50] });
    const a = straight.container.querySelector('path.react-flow__edge-path')?.getAttribute('d');
    const b = curved.container.querySelector('path.react-flow__edge-path')?.getAttribute('d');
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe('toFlowEdges (US1 scenario 6: a two-way exchange is two flows, shown distinctly)', () => {
  const nodes = [el(1, { layout: { x: 0, y: 0 } }), el(2, { layout: { x: 400, y: 0 } })];

  it('gives a single flow no curve', () => {
    const [edge] = toFlowEdges([...nodes, flow(3, 1, 2)]);
    expect(edge?.type).toBe('flow');
    expect(edge?.data?.curve).toBe(0);
  });

  it('puts two opposite flows between one pair on opposite sides of the straight line', () => {
    const edges = toFlowEdges([...nodes, flow(3, 1, 2), flow(4, 2, 1)]);
    const ab = edges.find((e) => e.id === eid(3));
    const ba = edges.find((e) => e.id === eid(4));
    // The sign of a curve is relative to the flow's own direction, so opposite flows with the same
    // sign are on opposite sides of the line. Equal signs here would mean drawn on top of each other.
    expect(ab?.data?.curve).not.toBe(0);
    expect(ba?.data?.curve).not.toBe(0);
    expect(Math.sign(Number(ab?.data?.curve))).toBe(Math.sign(Number(ba?.data?.curve)));
  });

  it('spreads several flows in one direction apart', () => {
    const edges = toFlowEdges([...nodes, flow(3, 1, 2), flow(4, 1, 2), flow(5, 1, 2)]);
    const curves = edges.map((e) => Number(e.data?.curve));
    expect(new Set(curves).size).toBe(3);
  });

  it('leaves from the side that faces the other node', () => {
    const [edge] = toFlowEdges([...nodes, flow(3, 1, 2)]);
    expect(edge?.sourceHandle).toBe('right');
    expect(edge?.targetHandle).toBe('left');
    const [down] = toFlowEdges([el(1, { layout: { x: 0, y: 0 } }), el(2, { layout: { x: 0, y: 400 } }), flow(3, 1, 2)]);
    expect(down?.sourceHandle).toBe('bottom');
    expect(down?.targetHandle).toBe('top');
  });

  it('draws no edge for a flow whose end is not on the diagram', () => {
    expect(toFlowEdges([nodes[0] as never, flow(3, 1, 2)])).toEqual([]);
  });
});
