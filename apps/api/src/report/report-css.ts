import { createHash } from 'node:crypto';

// The one stylesheet of the HTML report, for the screen and for print. It is embedded in the file, which allows it by
// this hash and nothing else (research #10): no `style` attribute in the document can run, and none is written.
// Black and white by design, so the printed report reads the same: shapes, border styles and words tell things apart,
// never colour alone (FR-020).
export const REPORT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0 auto; padding: 1rem; max-width: 62rem; color: #111; background: #fff; font: 16px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
h1, h2, h3, h4, h5, h6, dd, li, p, td, th, caption, figcaption { overflow-wrap: anywhere; }
h1 { font-size: 1.6rem; margin: 0 0 0.75rem; }
h2 { font-size: 1.3rem; margin: 2rem 0 0.5rem; border-bottom: 2px solid #111; padding-bottom: 0.15rem; }
h3 { font-size: 1.15rem; margin: 1.5rem 0 0.5rem; }
h4 { font-size: 1.05rem; margin: 1rem 0 0.4rem; }
h5 { font-size: 1rem; margin: 0 0 0.4rem; }
h6 { font-size: 0.9rem; margin: 0.6rem 0 0.2rem; }
dl.facts { margin: 0.25rem 0 0.5rem; }
dl.facts div { display: flex; gap: 0.5rem; margin: 0.1rem 0; }
dl.facts dt { flex: 0 0 12.5rem; font-weight: 600; }
dl.facts dd { margin: 0; min-width: 0; }
table { border-collapse: collapse; margin: 0.5rem 0 1rem; min-width: 16rem; }
caption { text-align: left; font-weight: 600; padding-bottom: 0.25rem; }
th, td { border: 1px solid #111; padding: 0.2rem 0.6rem; text-align: left; }
td { text-align: right; }
tbody tr:last-child th, tbody tr:last-child td { font-weight: 700; }
.group { margin: 0.5rem 0; }
.group .group { margin-left: 0.75rem; padding-left: 0.75rem; border-left: 2px dashed #111; }
.element { margin: 0.75rem 0; }
.threat { margin: 0.6rem 0 0.9rem; padding: 0.5rem 0.75rem; border: 1px solid #111; border-radius: 0.25rem; }
.text { white-space: pre-wrap; overflow-wrap: anywhere; margin: 0.25rem 0; }
.badge { display: inline-block; padding: 0 0.4rem; border: 2px solid #111; border-radius: 0.25rem; font-weight: 600; font-size: 0.9em; }
.status-open, .risk-high, .mitigation-implemented { border-style: solid; }
.status-mitigated, .risk-critical, .mitigation-verified { border-style: double; border-width: 4px; }
.status-accepted, .risk-medium { border-style: dashed; }
.status-not_applicable, .risk-low, .mitigation-proposed { border-style: dotted; }
.risk-high { border-width: 3px; }
.mitigations { margin: 0.25rem 0; padding-left: 1.5rem; }
.mitigations li { margin: 0.2rem 0; }
.ticket { display: inline; }
a { color: inherit; text-decoration: underline; }
.diagram-figure { margin: 0.5rem 0; overflow-x: auto; }
.diagram-figure figcaption { margin-top: 0.4rem; font-size: 0.9rem; }
svg.diagram { display: block; max-width: none; height: auto; background: #fff; }
.boundary-box { fill: none; stroke: #111; stroke-width: 1.5; stroke-dasharray: 8 4; }
.boundary-label { fill: #111; font-size: 12px; font-weight: 600; }
.box { fill: #fff; stroke: #111; stroke-width: 1.5; }
.store-line { fill: none; stroke: #111; stroke-width: 2; }
.label { fill: #111; font-size: 12px; }
.flow-line { fill: none; stroke: #111; stroke-width: 1.5; }
.arrowhead { fill: #111; }
/* The outline keeps a label legible where it passes over a line or a border, without a box that would hide a shape. */
.flow-label { fill: #111; font-size: 11px; paint-order: stroke; stroke: #fff; stroke-width: 3px; stroke-linejoin: round; }
@media (max-width: 40rem) {
  body { padding: 0.75rem; }
  dl.facts div { flex-direction: column; gap: 0; margin-bottom: 0.4rem; }
  dl.facts dt { flex-basis: auto; }
}
@page { margin: 16mm; }
@media print {
  body { max-width: none; padding: 0; font-size: 11pt; }
  .threat, table, figure { break-inside: avoid; }
  h2, h3, h4, h5, h6 { break-after: avoid; }
  .diagram-section { break-before: page; }
  .diagram-figure { overflow: visible; }
  svg.diagram { max-width: 100%; height: auto; }
}
`;

// The hash that goes in the file's Content-Security-Policy, worked out once from the exact text above.
export const REPORT_CSS_HASH = `sha256-${createHash('sha256').update(REPORT_CSS, 'utf8').digest('base64')}`;
