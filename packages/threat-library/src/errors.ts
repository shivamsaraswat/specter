// One problem found while loading the rule files (contracts/library-api.md).
export interface LoadIssue {
  file: string; // relative to the rules directory
  // The rule's id; in a rule file whose id can't be read, the file name without .yaml; in ids.yaml or
  // retired.yaml, the id of the entry at fault. null only when no id applies.
  rule: string | null;
  message: string; // field path and problem
}

function formatIssue(issue: LoadIssue): string {
  return issue.rule === null
    ? `${issue.file}: ${issue.message}`
    : `${issue.file} (${issue.rule}): ${issue.message}`;
}

// Thrown when any rule file is invalid. The library never loads partially (FR-013).
export class LibraryLoadError extends Error {
  readonly issues: readonly LoadIssue[];

  constructor(issues: readonly LoadIssue[]) {
    super(
      `The threat library has ${issues.length} problem${issues.length === 1 ? '' : 's'}:\n${issues.map(formatIssue).join('\n')}`,
    );
    this.name = 'LibraryLoadError';
    this.issues = Object.freeze([...issues]);
  }
}

// Thrown by candidatesFor for an element the library cannot evaluate (FR-016). The message names the
// problem, never the rejected value.
export class LibraryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryInputError';
  }
}
