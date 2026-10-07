import type { BatchOp } from './operations.js';

// The session's diagram actions, for undo and redo (spec FR-024 to FR-024d). It is kept in memory by the
// editor: it lasts as long as the editor does, so switching tabs keeps it and leaving the threat model
// ends it. It never touches the server; undoing is just another action, saved by the queue.

export const HISTORY_LIMIT = 100;

// One action taken, and the operations that take it back.
export interface HistoryStep {
  label: string;
  forward: BatchOp[];
  inverse: BatchOp[];
}

// The next step to undo, and the next to redo, are the last of their lists.
export interface HistorySnapshot {
  undo: readonly HistoryStep[];
  redo: readonly HistoryStep[];
}

export class DiagramHistory {
  private snapshot: HistorySnapshot = { undo: [], redo: [] };
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): HistorySnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(snapshot: HistorySnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  // A new action. What could have been redone is gone, and the oldest step drops past the limit.
  push(step: HistoryStep): void {
    this.set({ undo: [...this.snapshot.undo, step].slice(-HISTORY_LIMIT), redo: [] });
  }

  // Moves the latest step to the redo side and returns it, or null when there is none.
  undo(): HistoryStep | null {
    const step = this.snapshot.undo.at(-1);
    if (!step) return null;
    this.set({ undo: this.snapshot.undo.slice(0, -1), redo: [...this.snapshot.redo, step] });
    return step;
  }

  redo(): HistoryStep | null {
    const step = this.snapshot.redo.at(-1);
    if (!step) return null;
    this.set({ undo: [...this.snapshot.undo, step], redo: this.snapshot.redo.slice(0, -1) });
    return step;
  }

  // A step that could not be saved is not part of the history. Nothing happens if it is not there.
  remove(step: HistoryStep): void {
    const { undo, redo } = this.snapshot;
    if (!undo.includes(step) && !redo.includes(step)) return;
    this.set({ undo: undo.filter((candidate) => candidate !== step), redo: redo.filter((candidate) => candidate !== step) });
  }
}
