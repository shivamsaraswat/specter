import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Toolbar } from './Toolbar.js';
import { fakeEditor, renderWithEditor } from './test-helpers.js';

// FR-024, FR-024c, contracts/ui.md "Undo and redo": two buttons that say what they would do, and the
// usual keyboard shortcuts.

function show(overrides: Parameters<typeof fakeEditor>[0] = {}) {
  const editor = fakeEditor(overrides);
  renderWithEditor(<Toolbar />, editor);
  return editor;
}
const undoButton = () => screen.getByRole('button', { name: 'Undo' });
const redoButton = () => screen.getByRole('button', { name: 'Redo' });

describe('the Undo and Redo buttons', () => {
  it('are disabled when there is nothing to undo or redo', () => {
    show({ undoLabel: null, redoLabel: null });
    expect((undoButton() as HTMLButtonElement).disabled).toBe(true);
    expect((redoButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('say what they would undo or redo', () => {
    show({ undoLabel: 'Move API', redoLabel: 'Rename API' });
    expect((undoButton() as HTMLButtonElement).disabled).toBe(false);
    expect(undoButton().getAttribute('title')).toBe('Undo move API');
    expect(redoButton().getAttribute('title')).toBe('Redo rename API');
    // The name stays "Undo", and the description carries the rest, for a screen reader.
    expect(screen.getByRole('button', { name: 'Undo', description: 'Undo move API' })).toBeTruthy();
  });

  it('undo and redo when clicked', async () => {
    const editor = show({ undoLabel: 'Move API', redoLabel: 'Rename API' });
    const user = userEvent.setup();
    await user.click(undoButton());
    expect(editor.undo).toHaveBeenCalledTimes(1);
    await user.click(redoButton());
    expect(editor.redo).toHaveBeenCalledTimes(1);
  });
});

describe('the shortcuts', () => {
  it.each([
    ['Ctrl+Z', { key: 'z', ctrlKey: true }],
    ['⌘Z', { key: 'z', metaKey: true }],
  ])('%s undoes', (_name, event) => {
    const editor = show({ undoLabel: 'Move API', redoLabel: 'Rename API' });
    fireEvent.keyDown(document.body, event);
    expect(editor.undo).toHaveBeenCalledTimes(1);
    expect(editor.redo).not.toHaveBeenCalled();
  });

  it.each([
    ['Ctrl+Shift+Z', { key: 'Z', ctrlKey: true, shiftKey: true }],
    ['⌘⇧Z', { key: 'Z', metaKey: true, shiftKey: true }],
    ['Ctrl+Y', { key: 'y', ctrlKey: true }],
  ])('%s redoes', (_name, event) => {
    const editor = show({ undoLabel: 'Move API', redoLabel: 'Rename API' });
    fireEvent.keyDown(document.body, event);
    expect(editor.redo).toHaveBeenCalledTimes(1);
    expect(editor.undo).not.toHaveBeenCalled();
  });

  it('are taken from the page, so the browser does not also act on them', () => {
    show({ undoLabel: 'Move API', redoLabel: null });
    expect(fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })).toBe(false); // default prevented
  });

  it('leave a plain Z, and other modifiers, alone', () => {
    const editor = show({ undoLabel: 'Move API', redoLabel: 'Rename API' });
    fireEvent.keyDown(document.body, { key: 'z' });
    fireEvent.keyDown(document.body, { key: 'z', altKey: true, ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'y' });
    expect(editor.undo).not.toHaveBeenCalled();
    expect(editor.redo).not.toHaveBeenCalled();
  });

  it.each(['input', 'textarea', 'select'])('are ignored while focus is in a %s, which has its own undo', (tag) => {
    const editor = show({ undoLabel: 'Move API', redoLabel: 'Rename API' });
    const field = document.body.appendChild(document.createElement(tag));
    field.focus();
    expect(fireEvent.keyDown(field, { key: 'z', ctrlKey: true })).toBe(true); // left to the browser
    fireEvent.keyDown(field, { key: 'Z', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(field, { key: 'y', ctrlKey: true });
    expect(editor.undo).not.toHaveBeenCalled();
    expect(editor.redo).not.toHaveBeenCalled();
    field.remove();
  });

  it('do not take the key when there is nothing to undo', () => {
    const editor = show({ undoLabel: null, redoLabel: null });
    expect(fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })).toBe(true);
    expect(editor.undo).not.toHaveBeenCalled();
  });
});
