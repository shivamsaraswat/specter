import { IMPORT_MAX_DEPTH, IMPORT_MAX_VALUES } from './formats.js';

export type BoundsResult = { ok: true } | { ok: false; message: string };

const TOO_DEEP: BoundsResult = { ok: false, message: `file: nested more than ${IMPORT_MAX_DEPTH} levels deep` };
const TOO_MANY: BoundsResult = { ok: false, message: `file: has more than ${IMPORT_MAX_VALUES.toLocaleString('en-US')} values` };

// How deep a parsed file nests and how many values it holds, checked before any schema walks it (research #6, FR-020).
// The walk keeps its own stack, so a file nested a million levels deep is answered, not a stack overflow. The root is
// level 1 and counts as a value, as does every array element and every object member value. It stops at the first
// limit crossed, and its messages hold no key or value of the file.
export function checkBounds(value: unknown): BoundsResult {
  if (typeof value !== 'object' || value === null) return { ok: true };
  let count = 1;
  const containers: object[] = [value];
  const levels: number[] = [1];
  while (containers.length > 0) {
    const container = containers.pop() as object;
    const level = levels.pop() as number;
    const children: unknown[] = Array.isArray(container) ? container : Object.values(container);
    if (children.length === 0) continue;
    if (level + 1 > IMPORT_MAX_DEPTH) return TOO_DEEP;
    count += children.length;
    if (count > IMPORT_MAX_VALUES) return TOO_MANY;
    for (const child of children) {
      if (typeof child === 'object' && child !== null) {
        containers.push(child);
        levels.push(level + 1);
      }
    }
  }
  return { ok: true };
}
