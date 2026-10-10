import { z } from 'zod';
import type { ElementType } from './enums.js';

// Where an element sits on its diagram (spec FR-005, data-model.md "layout").
//
// COORDINATE FRAME: `x` and `y` are the element's top-left corner, relative to the top-left corner of
// its parent boundary, or to the diagram origin when it has none. Moving a boundary therefore changes
// one row, and a member keeps its stored position. A node's size is not stored; it is drawn at the
// fixed size for its type (NODE_SIZE). A trust boundary stores its own width and height.

// How far from the origin a position may be, and (below) the largest a trust boundary may be. Exported so an import can
// leave out or enlarge what another tool drew by the same limits.
export const COORDINATE_LIMIT = 100_000;
// The least a trust boundary's width or height may be; the editor's resizer uses it too.
export const MIN_BOUNDARY_SIZE = 40;
export const MAX_BOUNDARY_SIZE = 100_000;
const MAX_SIZE = MAX_BOUNDARY_SIZE;
const MIN_SIZE = MIN_BOUNDARY_SIZE;

const coordinate = z.number().min(-COORDINATE_LIMIT).max(COORDINATE_LIMIT);
const size = z.number().min(MIN_SIZE).max(MAX_SIZE);

export const nodeLayoutSchema = z.strictObject({ x: coordinate, y: coordinate });
export const boundaryLayoutSchema = z.strictObject({ x: coordinate, y: coordinate, width: size, height: size });
const nodeLayout = nodeLayoutSchema;
const boundaryLayout = boundaryLayoutSchema;

export type NodeLayout = z.infer<typeof nodeLayout>;
export type BoundaryLayout = z.infer<typeof boundaryLayout>;

// The only layout an element of this type may be given: null (not placed yet), or its class's shape.
// A data flow is drawn between its endpoints, so it never has one.
export function elementLayoutSchema(type: ElementType) {
  if (type === 'trust_boundary') return boundaryLayout.nullable();
  if (type === 'data_flow') return z.null({ error: 'a data flow can only have layout null' });
  return nodeLayout.nullable();
}

// The fixed size each node type is drawn at, used by the editor and by the "wholly inside" test.
export const NODE_SIZE = {
  external_entity: { width: 140, height: 60 },
  process: { width: 140, height: 60 },
  data_store: { width: 140, height: 60 },
} as const satisfies Record<'external_entity' | 'process' | 'data_store', { width: number; height: number }>;

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

// The part of an element that layout maths needs. An ElementRecord satisfies it.
export interface LayoutElement {
  id: string;
  type: ElementType;
  parent_boundary_id: string | null;
  layout: unknown;
}

function isPoint(value: unknown): value is Point {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Point).x === 'number' &&
    typeof (value as Point).y === 'number' &&
    Number.isFinite((value as Point).x) &&
    Number.isFinite((value as Point).y)
  );
}

// The element's top-left corner on the diagram, or null when it has no usable layout. A parent with
// no usable layout is treated as sitting at the origin. A cycle in the parent chain, which storage
// forbids, ends the walk instead of looping.
export function toAbsolute(element: LayoutElement, byId: ReadonlyMap<string, LayoutElement>): Point | null {
  if (!isPoint(element.layout)) return null;
  let x = element.layout.x;
  let y = element.layout.y;
  const seen = new Set([element.id]);
  let parentId = element.parent_boundary_id;
  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (isPoint(parent.layout)) {
      x += parent.layout.x;
      y += parent.layout.y;
    }
    parentId = parent.parent_boundary_id;
  }
  return { x, y };
}

// An absolute position expressed in the frame of a parent whose absolute corner is `parentAbsolute`
// (null for the diagram origin).
export function toRelative(absolute: Point, parentAbsolute: Point | null): Point {
  return parentAbsolute === null ? { ...absolute } : { x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y };
}

function boundaryRect(boundary: LayoutElement, byId: ReadonlyMap<string, LayoutElement>): Rect | null {
  const corner = toAbsolute(boundary, byId);
  const layout = boundary.layout as Partial<Rect> | null;
  if (corner === null || typeof layout?.width !== 'number' || typeof layout.height !== 'number') return null;
  return { ...corner, width: layout.width, height: layout.height };
}

// The id of the innermost boundary, among those whose rectangle on the diagram is given, that wholly
// contains `rect`, or null when none does. A rectangle touching a boundary's edge is inside; one that
// overlaps an edge is not. `excluded` holds ids that must not be chosen: the element itself and, for a
// boundary, its descendants, so a boundary can never be placed inside itself.
export function innermostOf(rect: Rect, boundaryRects: ReadonlyMap<string, Rect>, excluded: ReadonlySet<string>): string | null {
  let best: { id: string; area: number } | null = null;
  for (const [id, box] of boundaryRects) {
    if (excluded.has(id)) continue;
    const inside =
      rect.x >= box.x &&
      rect.y >= box.y &&
      rect.x + rect.width <= box.x + box.width &&
      rect.y + rect.height <= box.y + box.height;
    if (!inside) continue;
    const area = box.width * box.height;
    // Boundaries that wholly contain the same rectangle are nested, so the smallest is innermost.
    if (best === null || area < best.area) best = { id, area };
  }
  return best?.id ?? null;
}

// The same, from the elements as they are stored.
export function innermostContainer(
  rect: Rect,
  boundaries: readonly LayoutElement[],
  byId: ReadonlyMap<string, LayoutElement>,
  excluded: ReadonlySet<string>,
): string | null {
  const rects = new Map<string, Rect>();
  for (const boundary of boundaries) {
    if (boundary.type !== 'trust_boundary') continue;
    const box = boundaryRect(boundary, byId);
    if (box !== null) rects.set(boundary.id, box);
  }
  return innermostOf(rect, rects, excluded);
}
