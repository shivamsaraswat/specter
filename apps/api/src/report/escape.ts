// How user text is written into each format a report has, so that it reads back exactly as typed and cannot become
// anything else (FR-014): never a heading, list, table, link, image, markup or script, and never able to end a quoted
// label or break the structure around it.

// ---- Markdown (research #8) ----

// Every ASCII punctuation character: !"#$%&'()*+,-./ :;<=>?@ [\]^_` {|}~. CommonMark allows a backslash before any of
// them, and an escaped character can start no construct (emphasis, link, image, heading, list, table, code, HTML or
// entity). Escaping all of them, rather than the ones that matter today, means the next dialect's rule is covered too.
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/g;

function escapeLine(line: string): string {
  return (
    line
      .replaceAll(ASCII_PUNCTUATION, '\\$&')
      // Leading spaces and tabs would, from four columns, turn the line into an indented code block. Entities keep
      // them as typed.
      .replace(/^[ \t]+/, (lead) => [...lead].map((ch) => (ch === '\t' ? '&#9;' : '&#32;')).join(''))
  );
}

function linesOf(value: string): string[] {
  const lines = value.replaceAll(/\r\n|\r/g, '\n').split('\n');
  // A line break at the very end shows nothing, and would leave a blank line behind.
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// Text of any length, one escaped line each. Every line but the last ends with a backslash, a hard line break, so the
// lines stay lines. No line is blank, because a blank line would end the block (a quote, a list item) the text sits in.
export function markdownLines(value: string): string[] {
  const lines = linesOf(value).map(escapeLine);
  return lines.map((line, i) => (i < lines.length - 1 ? `${line}\\` : line));
}

export function markdownText(value: string): string {
  return markdownLines(value).join('\n');
}

// For a heading or a table cell, which are one line: the lines are joined with a space.
export function markdownInline(value: string): string {
  return linesOf(value).map(escapeLine).join(' ');
}

// A web address as the destination of an autolink, `<...>`: the characters that would end it, or that no address
// holds, are percent-encoded. Anything else stays as stored.
export function markdownAutolink(href: string): string {
  // \p{Cc}: the control characters. A space cannot end up in a stored address, but a record can come from anywhere.
  return `<${href.replaceAll(/[\p{Cc} <>]/gu, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}>`;
}

// ---- Mermaid (research #9) ----

// A label inside double quotes. Every character but a letter, a digit or a space is written as Mermaid's decimal
// entity, `#34;`, by code point, so nothing in it can close the quotes, start a Markdown string (a backtick), add an
// edge (`-->`), end a subgraph or write HTML.
export function mermaidLabel(value: string): string {
  return [...value].map((ch) => (/^[A-Za-z0-9 ]$/.test(ch) ? ch : `#${ch.codePointAt(0)};`)).join('');
}

// ---- HTML (research #10) ----

const HTML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Text, or the value of an attribute: the five characters that can end either are written as entities. Line breaks are
// written as LF whatever they were stored as, so the same text is the same bytes.
export function htmlText(value: string): string {
  return value.replaceAll(/\r\n|\r/g, '\n').replaceAll(/[&<>"']/g, (ch) => HTML_ENTITIES[ch] as string);
}
