import { ApiError } from '../api/errors.js';
import type { BatchOp, DiagramAction } from './operations.js';

// Saves the user's actions in order, one request at a time (research #8). Every action is one batch
// request, so it is stored all together or not at all, and a later action never overtakes an earlier
// one it may depend on. An action stays in `pending` until the server has answered for it: the screen
// shows the server's data with the pending actions replayed on top, so nothing the user did vanishes
// while it is waiting, whatever refetches in the meantime.
//
// When a save does not go through, what happens depends on why (spec FR-020, FR-020b):
//   - it could not be sent, or the server failed, or the session was refused: the action stays, with
//     everything behind it, and the user can retry. Nothing is lost, and nothing later overtakes it;
//   - the server refused it (400, an element that is gone, a reused id, an element with threats): it is
//     undone, the user is told why, and the actions behind it carry on;
//   - the whole threat model is gone: nothing more can be saved, and the queue stops for good.

export type SaveStatus = 'saved' | 'saving' | 'failed' | 'gone';

export interface QueueSnapshot {
  status: SaveStatus;
  // Actions the server has not confirmed: the one in flight (or failed) first, then those waiting.
  pending: readonly DiagramAction[];
  // Why the head action failed, while the status is `failed`.
  error: unknown;
}

export interface QueueHooks {
  // The server refused an action, which is no longer pending. `missing` is an element that another session
  // deleted, so what the page shows is out of date.
  onRejected(action: DiagramAction, message: string, kind: 'rejected' | 'missing'): void;
  // The server refused a delete because threats are linked to the element (spec FR-023).
  onThreatsBlocked(action: DiagramAction, message: string): void;
  // The threat model itself no longer exists.
  onGone(): void;
}

type Outcome = { kind: 'retry' } | { kind: 'gone' } | { kind: 'blocked' | 'rejected' | 'missing'; message: string };

function classify(error: unknown): Outcome {
  // A network failure, or anything that is not an answer from the API, is worth another try.
  if (!(error instanceof ApiError)) return { kind: 'retry' };
  const { status, message } = error;
  if (status === 404) return message === 'Threat model not found' ? { kind: 'gone' } : { kind: 'missing', message };
  if (status === 409) return { kind: message.includes('still has threats') ? 'blocked' : 'rejected', message };
  if (status === 400 || status === 413) return { kind: 'rejected', message };
  // 401 after its one renewal, 429, 5xx: the change is fine, it just could not be saved now.
  return { kind: 'retry' };
}

export class SaveQueue {
  private snapshot: QueueSnapshot = { status: 'saved', pending: [], error: null };
  private readonly listeners = new Set<() => void>();
  private running = false;

  // `send` stores one action's operations and resolves once the answer is in the app's data.
  constructor(
    private send: (ops: BatchOp[]) => Promise<unknown>,
    private hooks: Partial<QueueHooks> = {},
  ) {}

  // The queue outlives renders, so what it calls is replaced when the caller's changes.
  setSend(send: (ops: BatchOp[]) => Promise<unknown>): void {
    this.send = send;
  }

  setHooks(hooks: Partial<QueueHooks>): void {
    this.hooks = hooks;
  }

  getSnapshot = (): QueueSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // How many actions are not saved yet, counting one that failed: what the user would lose by leaving.
  pendingCount(): number {
    return this.snapshot.pending.length;
  }

  enqueue(action: DiagramAction): void {
    if (this.snapshot.status === 'gone') return;
    this.set({ pending: [...this.snapshot.pending, action] });
    // A failed head action holds everything behind it until the user retries.
    if (this.snapshot.status !== 'failed') void this.pump();
  }

  retry(): void {
    if (this.snapshot.status !== 'failed') return;
    this.set({ status: 'saving', error: null });
    void this.pump();
  }

  private set(change: Partial<QueueSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.snapshot.pending.length > 0) {
        const head = this.snapshot.pending[0];
        if (!head) break;
        this.set({ status: 'saving' });
        try {
          await this.send(head.ops);
        } catch (error) {
          const outcome = classify(error);
          if (outcome.kind === 'retry') {
            this.set({ status: 'failed', error });
            return;
          }
          if (outcome.kind === 'gone') {
            this.set({ status: 'gone', pending: [], error });
            this.hooks.onGone?.();
            return;
          }
          // The server answered no. The action is undone, the user is told, and the rest carry on.
          this.set({ pending: this.snapshot.pending.slice(1), error: null });
          if (outcome.kind === 'blocked') this.hooks.onThreatsBlocked?.(head, outcome.message);
          else this.hooks.onRejected?.(head, outcome.message, outcome.kind);
          continue;
        }
        this.set({ pending: this.snapshot.pending.slice(1) });
      }
      this.set({ status: 'saved', error: null });
    } finally {
      this.running = false;
    }
  }
}
