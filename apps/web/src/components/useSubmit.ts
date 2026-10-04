import { useEffect, useRef, useState } from 'react';
import { describeSubmitError, type MappedError } from '../api/errors.js';

const NO_ERRORS: MappedError = { fields: {}, form: null };

// "Fix 2 fields: Title, Category": the failing fields, by their visible labels, in the order the form
// shows them. `labels` maps a field name to its label and sets that order.
function fieldSummary(fields: Record<string, string>, labels: Record<string, string>): string | null {
  const failing = Object.keys(labels).filter((name) => name in fields);
  if (failing.length === 0) return null;
  return `Fix ${failing.length} ${failing.length === 1 ? 'field' : 'fields'}: ${failing.map((name) => labels[name]).join(', ')}`;
}

// The shared state of a form's submit: whether it is saving, and the messages to show. A rejection from
// the server is tied to its field where it can be; whatever the user typed is never cleared here.
//
// A rejected form is announced and focused (spec FR-020): `summary` goes in an alert region, so
// assistive technology says which fields to fix, and focus moves to the first invalid control, which is
// found through `formRef` by its aria-invalid attribute.
export function useSubmit(labels: Record<string, string>) {
  const [errors, setErrors] = useState<MappedError>(NO_ERRORS);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fieldNames = Object.keys(labels);

  useEffect(() => {
    if (Object.keys(errors.fields).length > 0) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [errors]);

  async function run(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      await action();
    } catch (err) {
      setErrors(describeSubmitError(err, fieldNames));
    } finally {
      setBusy(false);
    }
  }

  const summary = [errors.form, fieldSummary(errors.fields, labels)].filter(Boolean).join(' ') || null;
  return { errors, setErrors, busy, run, formRef, summary };
}
