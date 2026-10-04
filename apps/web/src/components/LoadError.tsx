import { writeErrorMessage } from '../api/errors.js';

// A list or record that could not be loaded: the server's message, and a way to try again.
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="alert">
      <p className="form-error">{writeErrorMessage(error)}</p>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
