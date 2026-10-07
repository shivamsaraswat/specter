import type { NodeChange } from '@xyflow/react';
import { useCallback, useEffect, useRef } from 'react';

// How long after the last arrow-key press a move is saved. A burst of presses is one move, and so one step
// to undo, and not a request for every key (spec FR-019: intermediate positions are never saved).
export const NUDGE_SAVE_DELAY_MS = 500;

// React Flow moves the selected, focused element itself when an arrow key is pressed (5 units, 20 with
// Shift) and reports it as position changes. Unlike a drag, which saves itself when it ends, nothing says a
// key press is over, so this notices those changes and calls `save` with the ids once they have stopped.
// Position changes that belong to a drag, or that are only part of one, are left to the drag.
export function useNudgeSaver(save: (ids: string[]) => void) {
  const nudged = useRef(new Set<string>());
  const dragging = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(save);
  useEffect(() => {
    latest.current = save;
  }, [save]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (nudged.current.size === 0) return;
    const ids = [...nudged.current];
    nudged.current.clear();
    latest.current(ids);
  }, []);

  // What is still waiting is saved if the canvas goes away first.
  useEffect(() => flush, [flush]);

  const observe = useCallback(
    (changes: NodeChange[]) => {
      let moved = false;
      for (const change of changes) {
        if (change.type !== 'position' || change.dragging === true || dragging.current) continue;
        nudged.current.add(change.id);
        moved = true;
      }
      if (!moved) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, NUDGE_SAVE_DELAY_MS);
    },
    [flush],
  );

  return {
    observe,
    dragStarted: useCallback(() => {
      dragging.current = true;
    }, []),
    dragStopped: useCallback(() => {
      dragging.current = false;
    }, []),
  };
}

// Inputs where Ctrl+Z means "undo my typing", which the browser handles itself. A radio button or a checkbox
// is an input too, but it has no typing to undo.
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'image', 'color']);

function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable === true;
}

// Ctrl+Z or ⌘Z undoes; Ctrl+Shift+Z, ⌘⇧Z or Ctrl+Y redoes (contracts/ui.md). Not while the user is typing in a
// field, which has its own undo, nor behind an open dialog, nor when there is nothing to do, so the browser's
// own handling of the key is only taken when the editor acts on it.
export function useUndoShortcuts(editor: { undoLabel: string | null; redoLabel: string | null; undo: () => void; redo: () => void }): void {
  const latest = useRef(editor);
  useEffect(() => {
    latest.current = editor;
  }, [editor]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      if (inTextField(event.target) || (event.target instanceof Element && event.target.closest('dialog') !== null)) return;
      const key = event.key.toLowerCase();
      const { undoLabel, redoLabel, undo, redo } = latest.current;
      if (key === 'z' && !event.shiftKey && undoLabel !== null) {
        event.preventDefault();
        undo();
      } else if (((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)) && redoLabel !== null) {
        event.preventDefault();
        redo();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
