import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ApiError } from '../api/errors.js';
import { ErrorSummary } from '../components/ErrorSummary.js';
import { FormField } from '../components/FormField.js';
import { useSession } from '../session/SessionProvider.js';

interface Origin {
  pathname: string;
  search?: string;
  hash?: string;
}

// Where to go after signing in: the page the user originally asked for, if the guard recorded one.
function returnTarget(state: unknown): string {
  const from = (state as { from?: Origin } | null)?.from;
  // Only an in-app path is ever followed.
  if (from && from.pathname.startsWith('/') && !from.pathname.startsWith('//')) {
    return `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`;
  }
  return '/projects';
}

export function LoginPage() {
  const { status, signIn, endedMessage } = useSession();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'signed-in') return <Navigate to={returnTarget(location.state)} replace />;
  if (status === 'checking') return <p className="page">Loading…</p>;

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (err) {
      // The username stays so it can be corrected; the password never does. One generic message, so
      // the page never says which of the two was wrong.
      setPassword('');
      if (err instanceof ApiError && err.status === 429) setError('Too many sign-in attempts. Try again later.');
      else if (err instanceof ApiError && (err.status === 401 || err.status === 400)) setError('Invalid username or password.');
      else setError('Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Sign in to Specter</h1>
      {endedMessage && <p role="status">{endedMessage}</p>}
      <form onSubmit={(event) => void onSubmit(event)}>
        <ErrorSummary message={error} />
        <FormField id="username" label="Username">
          {(control) => (
            <input
              {...control}
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          )}
        </FormField>
        <FormField id="password" label="Password">
          {(control) => (
            <input
              {...control}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </FormField>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
