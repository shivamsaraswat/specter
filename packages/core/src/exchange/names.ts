import { NAME_MAX_LENGTH } from '../fields.js';
import type { NameIssue } from './formats.js';

// The one definition of what is wrong with the names a file's threat models would get. The API's import plan and the
// web app's preview both call it, so a rename is judged the same on both sides without sending the file again
// (research #17).
//
// A name is compared as lower(btrim(name)) is by `threat_models_name_key`. Length counts code points, as Postgres'
// char_length does.
export function nameIssues(names: readonly string[], existingNames: readonly string[]): (NameIssue | null)[] {
  const key = (name: string): string => name.trim().toLowerCase();
  const taken = new Set(existingNames.map(key));
  const counts = new Map<string, number>();
  for (const name of names) counts.set(key(name), (counts.get(key(name)) ?? 0) + 1);
  return names.map((name) => {
    const trimmed = name.trim();
    if (trimmed === '') return 'empty';
    if ([...trimmed].length > NAME_MAX_LENGTH) return 'too_long';
    if ((counts.get(key(name)) ?? 0) > 1) return 'duplicate';
    if (taken.has(key(name))) return 'taken';
    return null;
  });
}
