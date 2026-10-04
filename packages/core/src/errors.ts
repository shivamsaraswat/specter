import type { z } from 'zod';

// Field and key names come from the client, so keep each one short and on one line.
const MAX_NAME_LENGTH = 64;
const safe = (name: string): string =>
  // eslint-disable-next-line no-control-regex
  name.replace(/[\u0000-\u001f\u007f]+/g, ' ').slice(0, MAX_NAME_LENGTH);

// One line for the { error } response body, one clause per issue, joined by "; ". Every clause
// names its field. It never includes the rejected value, so user input is not echoed back.
export function formatValidationError(error: z.ZodError): string {
  const clauses: string[] = [];
  for (const issue of error.issues) {
    const path = issue.path.map((segment) => safe(String(segment))).join('.');
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) clauses.push(`unknown field "${path ? `${path}.` : ''}${safe(key)}"`);
    } else {
      clauses.push(path ? `${path}: ${issue.message}` : issue.message);
    }
  }
  return clauses.join('; ');
}
