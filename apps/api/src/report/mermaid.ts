import { mermaidLabel } from './escape.js';
import type { BoundaryGroup, Report, ReportElement } from './model.js';

// The diagram of a Markdown report: a Mermaid flowchart, which code hosting sites and many wikis draw as a picture
// (FR-007). It is built from the diagram's elements and nothing else, so whether it is drawn at all depends only on
// the diagram (FR-007a).

// The most that is drawn. Mermaid's own defaults are 50,000 characters and 500 edges, and above them it shows an error
// in place of the picture. These leave room for a viewer set below the defaults; `report-render.spec.ts` checks that
// they stay under the installed Mermaid's defaults.
export const MERMAID_MAX_TEXT = 40_000;
export const MERMAID_MAX_EDGES = 400;

export type MermaidDiagram = { tooLarge: false; text: string } | { tooLarge: true; elementCount: number };

// `E7` is node `n7`, and a boundary `b7`: ids come from the order of the report, never from a name.
const idOf = (prefix: 'n' | 'b', ref: string): string => `${prefix}${ref.slice(1)}`;

function nodeLine(element: ReportElement, indent: string): string {
  const id = idOf('n', element.ref);
  const label = `"${mermaidLabel(element.displayName)}"`;
  switch (element.type) {
    case 'process':
      return `${indent}${id}([${label}])`;
    case 'data_store':
      return `${indent}${id}[(${label})]`;
    default:
      return `${indent}${id}[${label}]`;
  }
}

function groupLines(group: BoundaryGroup, depth: number): string[] {
  const indent = '  '.repeat(depth + 1);
  const lines: string[] = [];
  if (group.boundary !== null) lines.push(`${indent}subgraph ${idOf('b', group.boundary.ref)}["${mermaidLabel(group.boundary.displayName)}"]`);
  const inner = group.boundary === null ? indent : `${indent}  `;
  for (const element of group.elements) if (element.type !== 'data_flow') lines.push(nodeLine(element, inner));
  for (const child of group.children) lines.push(...groupLines(child, depth + 1));
  if (group.boundary !== null) lines.push(`${indent}end`);
  return lines;
}

export function renderMermaid(report: Report): MermaidDiagram {
  const lines = ['flowchart LR'];
  for (const group of report.groups) lines.push(...groupLines(group, 0));
  lines.push(...groupLines(report.outside, 0));
  // The arrows come after every subgraph, so Mermaid does not pull an end of a flow into the wrong group.
  let edges = 0;
  for (const flow of report.diagram.flows) {
    if (flow.sourceRef === '' || flow.targetRef === '') continue;
    edges += 1;
    lines.push(`  ${idOf('n', flow.sourceRef)} -->|"${mermaidLabel(flow.displayName)}"| ${idOf('n', flow.targetRef)}`);
  }
  const text = lines.join('\n');
  if (text.length > MERMAID_MAX_TEXT || edges > MERMAID_MAX_EDGES) return { tooLarge: true, elementCount: report.header.counts.elements };
  return { tooLarge: false, text };
}
