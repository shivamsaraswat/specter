import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog.js';

function setup() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Delete project"
      message={'Delete project "Payments"? This permanently deletes its threat models.'}
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('shows the title and the message, and opens as a modal', () => {
    setup();
    expect(screen.getByText('Delete project')).toBeTruthy();
    expect(screen.getByText(/permanently deletes its threat models/)).toBeTruthy();
    expect(document.querySelector('dialog')?.hasAttribute('open')).toBe(true);
  });

  it('starts with focus on Cancel', () => {
    setup();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  });

  it('calls onConfirm once on confirm, and never onCancel', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel on Cancel, and never onConfirm', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels on Escape', async () => {
    const { onConfirm, onCancel } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('returns focus to the control that opened it', async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && (
            <ConfirmDialog title="T" message="M" confirmLabel="Yes" onConfirm={() => undefined} onCancel={() => setOpen(false)} />
          )}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(opener);
  });
});
