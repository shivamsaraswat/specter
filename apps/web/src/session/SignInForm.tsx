import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../api/errors.js';
import { ErrorSummary } from '../components/ErrorSummary.js';
import { FormField } from '../components/FormField.js';

interface SignInFormProps {
  // When set, the username is shown and cannot be changed: the sign-in is for that account only.
  fixedUsername?: string;
  submitLabel?: string;
  busyLabel?: string;
  onSubmit: (username: string, password: string) => Promise<void>;
  // More buttons beside the submit one.
  children?: ReactNode;
}

// The sign-in form, shared by the sign-in page and by the prompt that asks the same account to sign in again
// over the editor. One generic message for a wrong username or password, so it never says which was wrong;
// the username stays so it can be corrected, and the password never does.
export function SignInForm({ fixedUsername, submitLabel = 'Sign in', busyLabel = 'Signing in…', onSubmit, children }: SignInFormProps) {
  const [username, setUsername] = useState(fixedUsername ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(fixedUsername ?? username, password);
    } catch (err) {
      setPassword('');
      if (err instanceof ApiError && err.status === 429) setError('Too many sign-in attempts. Try again later.');
      else if (err instanceof ApiError && (err.status === 401 || err.status === 400)) setError('Invalid username or password.');
      else setError('Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <ErrorSummary message={error} />
      <FormField id="username" label="Username">
        {(control) => (
          <input
            {...control}
            type="text"
            autoComplete="username"
            value={fixedUsername ?? username}
            readOnly={fixedUsername !== undefined}
            onChange={(event) => setUsername(event.target.value)}
          />
        )}
      </FormField>
      <FormField id="password" label="Password">
        {(control) => (
          <input {...control} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        )}
      </FormField>
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? busyLabel : submitLabel}
        </button>
        {children}
      </div>
    </form>
  );
}
