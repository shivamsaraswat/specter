import { htmlText } from './escape.js';
import type { DiagramFlow, DiagramShape, Report } from './model.js';

// The diagram of the HTML report: a still SVG at the positions of the canvas (FR-006, research #11). Look comes from the
// classes in report-css.ts and geometry from SVG's own attributes, never a `style` attribute, which the file's policy
// would not allow. Shapes tell the types apart without colour: a rectangle, a rounded one, an open-sided one, a dashed
// one.

// Text in a 12-unit font is estimated at this width a character, which errs on the wide side of a system sans-serif.
const CHAR_WIDTH = 7.2;
const PADDING = 8;
const FLOW_LABEL_MAX_CHARS = 24;
const FLOW_LABEL_HEIGHT = 16;

interface Point {
  x: number;
  y: number;
}
interface Box extends Point {
  width: number;
  height: number;
}

// Two decimals at most, so the bytes do not depend on floating-point noise.
const n = (value: number): string => String(Math.round(value * 100) / 100);

// SVG text does not wrap, and a name must not be cut off without saying so: one that would overflow is cut at a whole
// character, ends in an ellipsis, and carries the full name in a <title> (shown on hover, and read by software).
function labelText(name: string, room: number, attributes: string): string {
  const characters = [...name];
  const most = Math.floor((room - 2 * PADDING) / CHAR_WIDTH);
  if (characters.length <= most) return `<text ${attributes}>${htmlText(name)}</text>`;
  const shown = `${characters.slice(0, Math.max(1, most - 1)).join('')}…`;
  return `<text ${attributes}>${htmlText(shown)}<title>${htmlText(name)}</title></text>`;
}

const centerOf = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

// Where the line from `from` towards `to` leaves `box`: the point on its border.
function exitPoint(box: Box, from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (box.x + box.width - from.x) / dx);
  if (dx < 0) t = Math.min(t, (box.x - from.x) / dx);
  if (dy > 0) t = Math.min(t, (box.y + box.height - from.y) / dy);
  if (dy < 0) t = Math.min(t, (box.y - from.y) / dy);
  if (!Number.isFinite(t) || t < 0) return from;
  const reach = Math.min(t, 1);
  return { x: from.x + dx * reach, y: from.y + dy * reach };
}

const refNumber = (ref: string): number => Number(ref.slice(1));

// Where a flow's label is centred. It sits beside the line, never on it, so a label wider than the line cannot hide the
// arrow. Flows that share two shapes are shifted apart, and put their labels on the sides they were shifted towards, so
// neither label covers the other's line. A flow on its own has its label above it, or to its right if it runs straight
// up or down.
const LABEL_GAP = 3;
function labelCenter(middle: Point, sideways: Point, offset: number, width: number): Point {
  let side = { x: sideways.x * Math.sign(offset || 1), y: sideways.y * Math.sign(offset || 1) };
  if (offset === 0 && (side.y > 1e-6 || (Math.abs(side.y) <= 1e-6 && side.x < 0))) side = { x: -side.x, y: -side.y };
  // How far the middle of a box of this size must move along `side` to clear a line through the old middle.
  const reach = Math.abs(side.x) * (width / 2) + Math.abs(side.y) * (FLOW_LABEL_HEIGHT / 2) + LABEL_GAP;
  return { x: middle.x + side.x * reach, y: middle.y + side.y * reach };
}

function boundaryGroup(shape: DiagramShape): string {
  const label = labelText(shape.displayName, shape.width, `class="boundary-label" x="${n(shape.x + PADDING)}" y="${n(shape.y + 18)}"`);
  return `<g id="r-b${shape.ref.slice(1)}" class="shape boundary"><rect class="boundary-box" x="${n(shape.x)}" y="${n(shape.y)}" width="${n(shape.width)}" height="${n(shape.height)}"/>${label}</g>`;
}

function nodeGroup(shape: DiagramShape): string {
  const box = `x="${n(shape.x)}" y="${n(shape.y)}" width="${n(shape.width)}" height="${n(shape.height)}"`;
  const label = labelText(shape.displayName, shape.width, `class="label" x="${n(shape.x + shape.width / 2)}" y="${n(shape.y + shape.height / 2 + 4)}" text-anchor="middle"`);
  const id = `r-n${shape.ref.slice(1)}`;
  switch (shape.type) {
    case 'process':
      return `<g id="${id}" class="shape process"><rect class="box" ${box} rx="12"/>${label}</g>`;
    case 'data_store': {
      const right = shape.x + shape.width;
      const bottom = shape.y + shape.height;
      return `<g id="${id}" class="shape store"><path class="store-line" d="M ${n(shape.x)} ${n(shape.y)} H ${n(right)} M ${n(shape.x)} ${n(bottom)} H ${n(right)}"/>${label}</g>`;
    }
    default:
      return `<g id="${id}" class="shape entity"><rect class="box" ${box}/>${label}</g>`;
  }
}

function flowGroup(flow: DiagramFlow, nodes: ReadonlyMap<string, DiagramShape>): string {
  const source = nodes.get(flow.sourceRef);
  const target = nodes.get(flow.targetRef);
  if (source === undefined || target === undefined) return '';
  const from = centerOf(source);
  const to = centerOf(target);
  // The shift is sideways to the direction from the lower-numbered end to the higher, so flows in either direction
  // between the same two shapes, which share one shift scale, do not meet.
  const [low, high] = refNumber(flow.sourceRef) <= refNumber(flow.targetRef) ? [from, to] : [to, from];
  const length = Math.hypot(high.x - low.x, high.y - low.y);
  const sideways = length === 0 ? { x: 0, y: -1 } : { x: -(high.y - low.y) / length, y: (high.x - low.x) / length };
  const shift = { x: sideways.x * flow.offset, y: sideways.y * flow.offset };
  const start = { x: from.x + shift.x, y: from.y + shift.y };
  const end = { x: to.x + shift.x, y: to.y + shift.y };
  const a = exitPoint(source, start, end);
  const b = exitPoint(target, end, start);
  const shownChars = Math.min([...flow.displayName].length, FLOW_LABEL_MAX_CHARS);
  const width = shownChars * CHAR_WIDTH + 2 * PADDING;
  const middle = labelCenter({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, sideways, flow.offset, width);
  const label = labelText(flow.displayName, FLOW_LABEL_MAX_CHARS * CHAR_WIDTH + 2 * PADDING, `class="flow-label" x="${n(middle.x)}" y="${n(middle.y + 4)}" text-anchor="middle"`);
  return (
    `<g id="r-f${flow.ref.slice(1)}" class="flow">` +
    `<line class="flow-line" x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" marker-end="url(#arrow)"/>` +
    `${label}</g>`
  );
}

// The picture, or nothing when there is nothing to draw.
export function renderSvg(report: Report): string {
  const { viewBox, nodes, boundaries, flows } = report.diagram;
  if (viewBox === null) return '';
  const byRef = new Map<string, DiagramShape>(nodes.map((node) => [node.ref, node]));
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="diagram" role="img" aria-labelledby="diagram-caption" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}" width="${viewBox.width}" height="${viewBox.height}">`,
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path class="arrowhead" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>',
    ...boundaries.map(boundaryGroup),
    ...nodes.map(nodeGroup),
    ...flows.map((flow) => flowGroup(flow, byRef)).filter((group) => group !== ''),
    '</svg>',
  ].join('\n');
}
