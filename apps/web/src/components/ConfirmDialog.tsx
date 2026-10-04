import { useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Asks before something is deleted. It is mounted when needed and built on the native <dialog>, which
// traps focus while it is open. Focus starts on Cancel, Escape cancels, and focus returns to the
// control that opened it.
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }

  // A close request that did not come from the keyboard, such as a mobile back gesture.
  function onClose(event: SyntheticEvent<HTMLDialogElement>): void {
    event.preventDefault();
    onCancel();
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="confirm-title" onKeyDown={onKeyDown} onCancel={onClose}>
      <h2 id="confirm-title">{title}</h2>
      <p>{message}</p>
      <div className="actions">
        <button type="button" ref={cancelRef} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
