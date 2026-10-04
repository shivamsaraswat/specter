import type { ReactNode } from 'react';

interface ControlProps {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

interface FormFieldProps {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  // Receives the props that tie the control to its label and its message.
  children: (control: ControlProps) => ReactNode;
}

// A visible label, its control, and a message (an error, or else a hint) linked with aria-describedby.
export function FormField({ id, label, error, hint, children }: FormFieldProps) {
  const messageId = `${id}-message`;
  const message = error ?? hint ?? null;
  const control: ControlProps = { id };
  if (error) control['aria-invalid'] = true;
  if (message) control['aria-describedby'] = messageId;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(control)}
      {message && (
        <p id={messageId} className={error ? 'field-error' : 'muted'}>
          {message}
        </p>
      )}
    </div>
  );
}
