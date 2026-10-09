import type { OnNodesChange, ReactFlowProps } from '@xyflow/react';
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Canvas } from './Canvas.js';
import { SelectionAnnouncer, describeSelection } from './SelectionAnnouncer.js';
import { eid, el, fakeEditor, renderWithEditor } from './test-helpers.js';

// FR-025, FR-026, contracts/ui.md "Keyboard" and "Announcements".

const captured = vi.hoisted(() => ({ props: null as ReactFlowProps | null }));
vi.mock('@xyflow/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...original,
    ReactFlow: (props: ReactFlowProps) => {
      captured.props = props;
      return <div data-testid="flow" />;
    },
  };
});

const elements = [
  el(1, { type: 'process', name: 'API', layout: { x: 100, y: 100 } }),
  el(2, { type: 'data_store', name: 'DB', layout: { x: 400, y: 100 } }),
];
const props = () => captured.props as ReactFlowProps;
// What React Flow reports when an arrow key moves the selected node: a position change that is not a drag.
const nudge = (id: string, x: number, y: number) =>
  act(() => (props().onNodesChange as OnNodesChange)([{ type: 'position', id, position: { x, y }, dragging: false }]));

describe('moving an element with the arrow keys', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves once, half a second after the last key press, as one action', () => {
    const editor = fakeEditor({ elements });
    renderWithEditor(<Canvas />, editor);

    nudge(eid(1), 105, 100);
    act(() => void vi.advanceTimersByTime(200));
    nudge(eid(1), 110, 100);
    act(() => void vi.advanceTimersByTime(200));
    nudge(eid(1), 115, 100);
    expect(editor.apply).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(500));

    expect(editor.apply).toHaveBeenCalledTimes(1);
    expect(vi.mocked(editor.apply).mock.calls[0]?.[0].ops).toEqual([{ op: 'update', id: eid(1), changes: { layout: { x: 115, y: 100 } } }]);
  });

  it('saves several elements moved in the same burst together', () => {
    const editor = fakeEditor({ elements });
    renderWithEditor(<Canvas />, editor);

    nudge(eid(1), 105, 100);
    nudge(eid(2), 405, 100);
    act(() => void vi.advanceTimersByTime(600));

    expect(editor.apply).toHaveBeenCalledTimes(1);
    expect(vi.mocked(editor.apply).mock.calls[0]?.[0].ops).toHaveLength(2);
  });

  it('does not save the position changes of a drag, which the drag saves itself when it ends', () => {
    const editor = fakeEditor({ elements });
    renderWithEditor(<Canvas />, editor);

    act(() => (props().onNodesChange as OnNodesChange)([{ type: 'position', id: eid(1), position: { x: 150, y: 100 }, dragging: true }]));
    act(() => void vi.advanceTimersByTime(1000));

    expect(editor.apply).not.toHaveBeenCalled();
  });

  it('puts the move in a boundary when the element is nudged into it', () => {
    const boundary = el(3, { type: 'trust_boundary', name: 'VPC', layout: { x: 600, y: 0, width: 400, height: 300 } });
    const editor = fakeEditor({ elements: [...elements, boundary] });
    renderWithEditor(<Canvas />, editor);

    nudge(eid(2), 650, 50);
    act(() => void vi.advanceTimersByTime(600));

    expect(vi.mocked(editor.apply).mock.calls[0]?.[0].ops).toEqual([
      { op: 'update', id: eid(2), changes: { parent_boundary_id: eid(3), layout: { x: 50, y: 50 } } },
    ]);
  });
});

describe('Delete and Backspace', () => {
  it.each(['Delete', 'Backspace'])('%s asks to delete the selected element, and nothing else', (key) => {
    const editor = fakeEditor({ elements, selectedIds: [eid(1)] });
    renderWithEditor(<Canvas />, editor);

    fireEvent.keyDown(screen.getByRole('application', { name: 'Data-flow diagram' }), { key });

    expect(editor.requestDelete).toHaveBeenCalledWith(eid(1));
    expect(editor.apply).not.toHaveBeenCalled();
  });

  it('does nothing with no element selected, or several', () => {
    const none = fakeEditor({ elements });
    renderWithEditor(<Canvas />, none);
    fireEvent.keyDown(screen.getByRole('application', { name: 'Data-flow diagram' }), { key: 'Delete' });
    expect(none.requestDelete).not.toHaveBeenCalled();
  });
});

describe('Escape', () => {
  it('clears the selection', () => {
    const editor = fakeEditor({ elements, selectedIds: [eid(1)] });
    renderWithEditor(<Canvas />, editor);

    fireEvent.keyDown(screen.getByRole('application', { name: 'Data-flow diagram' }), { key: 'Escape' });

    expect(editor.select).toHaveBeenCalledWith([]);
  });
});

describe('the words React Flow reads out', () => {
  it('names each node and each flow by its type and name, not by its id', () => {
    const flow = el(3, { type: 'data_flow', name: 'Query', layout: null, source_element_id: eid(1), target_element_id: eid(2) });
    renderWithEditor(<Canvas />, fakeEditor({ elements: [...elements, flow] }));
    expect(props().nodes?.map((n) => n.ariaLabel)).toEqual(expect.arrayContaining(['Process API', 'Data store DB']));
    expect(props().edges?.map((e) => e.ariaLabel)).toEqual(['Data flow Query, from API to DB']);
  });
});

describe('describeSelection (FR-026)', () => {
  const boundary = el(10, { type: 'trust_boundary', name: 'VPC', layout: { x: 0, y: 0, width: 500, height: 400 } });
  const inside = el(11, { type: 'process', name: 'API', parent_boundary_id: eid(10) });
  const outside = el(12, { type: 'data_store', name: 'DB' });
  const flow = el(13, { type: 'data_flow', name: 'Query', layout: null, source_element_id: eid(11), target_element_id: eid(12) });
  const all = [boundary, inside, outside, flow];

  it('gives the type, the name and the boundary of a node', () => {
    expect(describeSelection(all, [eid(11)])).toBe('Process API, in VPC');
    expect(describeSelection(all, [eid(12)])).toBe('Data store DB, in no trust boundary');
  });

  it('gives a boundary and the one it is in', () => {
    const nested = el(14, { type: 'trust_boundary', name: 'Subnet', layout: { x: 0, y: 0, width: 100, height: 100 }, parent_boundary_id: eid(10) });
    expect(describeSelection([...all, nested], [eid(14)])).toBe('Trust boundary Subnet, in VPC');
    expect(describeSelection(all, [eid(10)])).toBe('Trust boundary VPC, in no trust boundary');
  });

  it('gives the source and target of a flow', () => {
    expect(describeSelection(all, [eid(13)])).toBe('Data flow Query, from API to DB');
  });

  it('adds the open-threat count, only when above 0 (FR-017)', () => {
    const counts = new Map([[eid(11), 3], [eid(13), 1]]);
    expect(describeSelection(all, [eid(11)], counts)).toBe('Process API, in VPC, 3 open threats');
    expect(describeSelection(all, [eid(13)], counts)).toBe('Data flow Query, from API to DB, 1 open threat');
    expect(describeSelection(all, [eid(12)], counts)).toBe('Data store DB, in no trust boundary');
  });

  it('says nothing for no selection, several, or an element that is gone', () => {
    expect(describeSelection(all, [])).toBe('');
    expect(describeSelection(all, [eid(11), eid(12)])).toBe('');
    expect(describeSelection(all, [eid(99)])).toBe('');
  });
});

describe('SelectionAnnouncer', () => {
  it('announces the selection in a polite live region', () => {
    renderWithEditor(<SelectionAnnouncer />, fakeEditor({ elements: [el(1, { name: 'API' })], selectedIds: [eid(1)] }));
    const region = screen.getByRole('status', { name: 'Selection' });
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('Process API, in no trust boundary');
  });
});
