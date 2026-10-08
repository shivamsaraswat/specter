import { isAlias, isNode, parseDocument, visit } from 'yaml';
import type { LoadIssue } from './errors.js';

export type YamlResult = { value: unknown } | { issues: LoadIssue[] };

// Strict YAML 1.2 (research #3): the core schema, so `yes` and `no` are text and a date stays text;
// duplicate keys, anchors, aliases, tags it cannot resolve and several documents in one file are all
// refused, and parser warnings count as errors. `rule` labels every issue (see LoadIssue).
export function parseYamlFile(file: string, text: string, rule: string | null): YamlResult {
  const issues: LoadIssue[] = [];
  const add = (message: string): void => {
    issues.push({ file, rule, message });
  };

  const doc = parseDocument(text, {
    version: '1.2',
    schema: 'core',
    uniqueKeys: true,
    prettyErrors: true,
  });
  for (const problem of [...doc.errors, ...doc.warnings]) {
    // Pretty errors carry the position; the message's own first line is "<problem> at line N, column M:".
    const line = problem.linePos?.[0].line;
    const reason =
      problem.code === 'MULTIPLE_DOCS'
        ? 'a rule file holds one rule: remove the "---" separator and keep one document'
        : (problem.message.split('\n')[0] ?? 'invalid YAML').replace(
            / at line \d+, column \d+:$/,
            '',
          );
    add(line === undefined ? reason : `${reason} (line ${line})`);
  }
  if (issues.length > 0) return { issues };

  visit(doc, (_key, node) => {
    if (isAlias(node)) add('aliases are not allowed: write each rule out in full');
    else if (isNode(node) && node.anchor)
      add('anchors are not allowed: write each rule out in full');
  });
  if (issues.length > 0) return { issues };

  return { value: doc.toJS() as unknown };
}
