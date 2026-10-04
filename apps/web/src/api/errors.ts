// An error response from the API: its HTTP status and the server's fixed `{ error }` message.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface MappedError {
  // Messages for form fields, keyed by field name.
  fields: Record<string, string>;
  // Whatever could not be tied to a field, or null.
  form: string | null;
}

// M5's fixed messages for a duplicate name. They belong to the name field.
const NAME_CONFLICTS = new Set([
  'A project with this name already exists',
  'A threat model with this name already exists in this project',
]);

// The API answers a rejected body with one line: core's formatter joins one clause per issue with
// "; ", and each clause is "<field>: <message>" or `unknown field "<name>"`. This splits that line so
// each message appears next to its field. A clause for a field the form doesn't have goes to the form.
export function mapServerError(message: string, knownFields: string[]): MappedError {
  if (NAME_CONFLICTS.has(message) && knownFields.includes('name')) {
    return { fields: { name: message }, form: null };
  }
  const fields: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const clause of message.split('; ')) {
    const at = clause.indexOf(': ');
    const field = at > 0 ? clause.slice(0, at) : '';
    if (field && knownFields.includes(field)) {
      const text = clause.slice(at + 2);
      fields[field] = fields[field] ? `${fields[field]}; ${text}` : text;
    } else {
      unmatched.push(clause);
    }
  }
  return { fields, form: unmatched.length > 0 ? unmatched.join('; ') : null };
}

// Turns an error response into an ApiError. The API answers `{ error: string }`; anything else, such as
// an HTML page from a proxy, becomes a fixed message so nothing unexpected is shown to the user.
export async function toApiError(res: Response): Promise<ApiError> {
  let message = 'Request failed';
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      message = body.error;
    }
  } catch {
    // Not JSON: keep the fixed message.
  }
  return new ApiError(res.status, message);
}

// "must not be empty" => "Must not be empty": core's messages are lower-case phrases.
const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// Field messages from a failed client-side check, keyed by the first path segment of each issue. The
// forms check with the same schemas as the API (spec FR-015), so a rejection looks the same either way.
export function zodFieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }): MappedError {
  const fields: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string') fields[field] ??= capitalize(issue.message);
    else unmatched.push(capitalize(issue.message));
  }
  return { fields, form: unmatched.length > 0 ? unmatched.join('; ') : null };
}

export const GONE_MESSAGE = 'This item no longer exists.';

export function isGone(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

// What to tell the user about a failed write: a record that was deleted elsewhere says so, a rejection
// shows the server's own fixed message, and anything else is generic.
export function writeErrorMessage(err: unknown): string {
  if (isGone(err)) return GONE_MESSAGE;
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Try again.';
}

// The same, for a form: server messages are tied to their fields where they can be.
export function describeSubmitError(err: unknown, fields: string[]): MappedError {
  if (err instanceof ApiError && !isGone(err)) return mapServerError(err.message, fields);
  return { fields: {}, form: writeErrorMessage(err) };
}
