// Where focus goes when a row leaves the list because the user changed it (contracts/web-ui.md §1). Without this,
// the row's control disappears with focus on it, and focus falls back to the top of the page.

// The id of a threat's status control: the first thing in its row, and so where focus lands.
export const statusControlId = (threatId: string): string => `threat-status-${threatId}`;

// Focuses the status control of the row after the one leaving, or the row before it when it was the last. Returns
// false when no other row is shown, so the caller can focus something else.
export function focusNeighbour(shown: readonly string[], leaving: string): boolean {
  const at = shown.indexOf(leaving);
  const target = shown[at + 1] ?? (at > 0 ? shown[at - 1] : undefined);
  const control = target === undefined ? null : document.getElementById(statusControlId(target));
  control?.focus();
  return control !== null;
}

export const LEFT_THE_VIEW = 'Saved. The threat no longer matches this view.';

// What the live region says after `departures` rows have left, one after another with nothing else saved in between;
// nothing when none has. A live region speaks only when its text changes, and the words are the same for every row,
// so every other message ends in a no-break space: it is not heard, and it makes the second row a change.
export const leftMessage = (departures: number): string => (departures === 0 ? '' : departures % 2 === 1 ? LEFT_THE_VIEW : `${LEFT_THE_VIEW}\u00a0`);
