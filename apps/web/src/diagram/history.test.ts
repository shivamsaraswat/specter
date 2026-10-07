import { describe, expect, it, vi } from 'vitest';
import { DiagramHistory, HISTORY_LIMIT, type HistoryStep } from './history.js';
import { eid } from './test-helpers.js';

// FR-024 to FR-024d: undo and redo walk back and forth over the session's actions, up to 100 of them.

const step = (n: number): HistoryStep => ({
  label: `Step ${n}`,
  forward: [{ op: 'update', id: eid(1), changes: { name: `after ${n}` } }],
  inverse: [{ op: 'update', id: eid(1), changes: { name: `before ${n}` } }],
});
const labels = (steps: readonly HistoryStep[]) => steps.map((s) => s.label);

describe('DiagramHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const history = new DiagramHistory();
    expect(history.getSnapshot()).toEqual({ undo: [], redo: [] });
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it('undoes the latest step first, and redoes in the order they were undone', () => {
    const history = new DiagramHistory();
    const [a, b, c] = [step(1), step(2), step(3)];
    history.push(a);
    history.push(b);
    history.push(c);

    expect(history.undo()).toBe(c);
    expect(history.undo()).toBe(b);
    expect(labels(history.getSnapshot().undo)).toEqual(['Step 1']);
    expect(labels(history.getSnapshot().redo)).toEqual(['Step 3', 'Step 2']); // the next to redo is last

    expect(history.redo()).toBe(b);
    expect(history.redo()).toBe(c);
    expect(history.redo()).toBeNull();
    expect(labels(history.getSnapshot().undo)).toEqual(['Step 1', 'Step 2', 'Step 3']);
  });

  it('forgets what could be redone when a new action is made', () => {
    const history = new DiagramHistory();
    history.push(step(1));
    history.push(step(2));
    history.undo();
    expect(history.getSnapshot().redo).toHaveLength(1);

    history.push(step(3));
    expect(history.getSnapshot().redo).toHaveLength(0);
    expect(labels(history.getSnapshot().undo)).toEqual(['Step 1', 'Step 3']);
  });

  it(`keeps the last ${HISTORY_LIMIT} steps, and the oldest drops`, () => {
    const history = new DiagramHistory();
    for (let n = 1; n <= HISTORY_LIMIT + 5; n += 1) history.push(step(n));
    const { undo } = history.getSnapshot();
    expect(undo).toHaveLength(HISTORY_LIMIT);
    expect(undo[0]?.label).toBe('Step 6');
    expect(undo.at(-1)?.label).toBe(`Step ${HISTORY_LIMIT + 5}`);
  });

  it('removes a step wherever it is, from either side', () => {
    const history = new DiagramHistory();
    const [a, b, c] = [step(1), step(2), step(3)];
    [a, b, c].forEach((s) => history.push(s));
    history.undo(); // c is now redoable

    history.remove(b);
    history.remove(c);
    expect(history.getSnapshot()).toEqual({ undo: [a], redo: [] });
    // A step that is not there is not an error.
    history.remove(b);
    expect(history.getSnapshot().undo).toEqual([a]);
  });

  it('tells its subscribers when it changes, and gives a new snapshot only then', () => {
    const history = new DiagramHistory();
    const listener = vi.fn();
    const unsubscribe = history.subscribe(listener);
    const empty = history.getSnapshot();

    history.undo();
    expect(listener).not.toHaveBeenCalled();
    expect(history.getSnapshot()).toBe(empty);

    history.push(step(1));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(history.getSnapshot()).not.toBe(empty);

    unsubscribe();
    history.undo();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
