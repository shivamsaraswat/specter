import type { ElementType } from './enums.js';
import { positionOf, sizeOf } from './layout-read.js';
import { NODE_SIZE, type Rect } from './layout.js';
import type { ElementRecord } from './schemas/element.js';

// Where each element is drawn, when its stored layout cannot say (research #12). Nothing here is saved:
// an element with no layout is placed on a grid on screen, and its position is stored the first time
// the user moves it. Positions are relative to the parent boundary, as they are stored.

export interface Resolved {
  x: number;
  y: number;
  // Only for a trust boundary.
  width?: number;
  height?: number;
}

const GAP = 24;
// Room for a boundary's label at the top, and a margin at its sides.
const BOUNDARY_HEADER = 40;
const BOUNDARY_MARGIN = 20;
export const DEFAULT_BOUNDARY_SIZE = { width: 320, height: 220 } as const;
// Unplaced top-level elements are laid out in rows of at most this many columns.
const COLUMNS = 4;

export function sizeFor(element: ElementRecord): { width: number; height: number } {
  if (element.type === 'trust_boundary') return sizeOf(element) ?? DEFAULT_BOUNDARY_SIZE;
  return NODE_SIZE[element.type as Exclude<ElementType, 'trust_boundary' | 'data_flow'>];
}

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const free = (candidate: Rect, occupied: readonly Rect[]): boolean => occupied.every((other) => !overlaps(candidate, other));

// The first free place on a grid that starts at `origin` and runs left to right, then down.
function firstFreeSpot(
  occupied: readonly Rect[],
  size: { width: number; height: number },
  origin: { x: number; y: number },
  maxRight: number | null,
): { x: number; y: number } {
  const stepX = size.width + GAP;
  const stepY = size.height + GAP;
  for (let row = 0; row < 500; row += 1) {
    for (let column = 0; column < COLUMNS * 4; column += 1) {
      const candidate = { x: origin.x + column * stepX, y: origin.y + row * stepY, ...size };
      if (maxRight !== null && candidate.x + size.width > maxRight) break;
      if (free(candidate, occupied)) return { x: candidate.x, y: candidate.y };
      if (maxRight === null && column + 1 >= COLUMNS) break;
    }
  }
  return origin;
}

// Where every node and boundary is drawn: relative to its parent boundary, as stored.
export function resolveLayout(elements: readonly ElementRecord[]): Map<string, Resolved> {
  const nodes = elements.filter((element) => element.type !== 'data_flow');
  const byId = new Map(nodes.map((element) => [element.id, element]));
  // Stored membership wins over geometry (spec edge case), so a member is always drawn in its parent.
  const parentOf = (element: ElementRecord): string | null => {
    const parent = element.parent_boundary_id === null ? undefined : byId.get(element.parent_boundary_id);
    return parent?.type === 'trust_boundary' ? parent.id : null;
  };

  const groups = new Map<string | null, ElementRecord[]>();
  for (const element of nodes) {
    const key = parentOf(element);
    groups.set(key, [...(groups.get(key) ?? []), element]);
  }

  const result = new Map<string, Resolved>();
  for (const [parentId, children] of groups) {
    const parent = parentId === null ? null : byId.get(parentId);
    const area = parent ? sizeFor(parent) : null;
    const occupied: Rect[] = [];
    const unplaced: ElementRecord[] = [];

    for (const child of children) {
      const size = sizeFor(child);
      const stored = positionOf(child);
      if (stored === null) {
        unplaced.push(child);
        continue;
      }
      // Inside a boundary, a position that falls outside it is pulled back in.
      const x = area ? Math.min(Math.max(stored.x, 0), Math.max(0, area.width - size.width)) : stored.x;
      const y = area ? Math.min(Math.max(stored.y, 0), Math.max(0, area.height - size.height)) : stored.y;
      occupied.push({ x, y, ...size });
      result.set(child.id, child.type === 'trust_boundary' ? { x, y, ...size } : { x, y });
    }

    const origin = area
      ? { x: BOUNDARY_MARGIN, y: BOUNDARY_HEADER }
      : { x: occupied.length === 0 ? 0 : Math.max(...occupied.map((r) => r.x + r.width)) + GAP, y: 0 };
    for (const child of unplaced) {
      const size = sizeFor(child);
      const spot = firstFreeSpot(occupied, size, origin, area ? area.width - BOUNDARY_MARGIN : null);
      occupied.push({ ...spot, ...size });
      result.set(child.id, child.type === 'trust_boundary' ? { ...spot, ...size } : spot);
    }
  }
  return result;
}

// The rectangle of every node and boundary on the diagram itself (not relative to a parent), given
// where each is drawn.
export function absoluteRects(elements: readonly ElementRecord[], resolved: ReadonlyMap<string, Resolved>): Map<string, Rect> {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const rects = new Map<string, Rect>();
  for (const element of elements) {
    if (element.type === 'data_flow') continue;
    const here = resolved.get(element.id);
    if (!here) continue;
    let x = here.x;
    let y = here.y;
    const seen = new Set([element.id]);
    let parentId = element.parent_boundary_id;
    while (parentId !== null && !seen.has(parentId)) {
      seen.add(parentId);
      const at = resolved.get(parentId);
      if (!at) break;
      x += at.x;
      y += at.y;
      parentId = byId.get(parentId)?.parent_boundary_id ?? null;
    }
    // A boundary's size is what is drawn, which a resize in progress may have changed.
    const size = here.width !== undefined && here.height !== undefined ? { width: here.width, height: here.height } : sizeFor(element);
    rects.set(element.id, { x, y, ...size });
  }
  return rects;
}

// A free place for something of this size, as close to `center` as the elements already there allow.
// Used for an element added with a button: it appears in view, and not on top of another one.
export function freeSpotNear(
  center: { x: number; y: number },
  occupied: readonly Rect[],
  size: { width: number; height: number },
): { x: number; y: number } {
  const stepX = size.width + GAP;
  const stepY = size.height + GAP;
  const home = { x: center.x - size.width / 2, y: center.y - size.height / 2 };
  for (let ring = 0; ring < 60; ring += 1) {
    const candidates: { x: number; y: number }[] = [];
    for (let i = -ring; i <= ring; i += 1) {
      for (let j = -ring; j <= ring; j += 1) {
        if (Math.max(Math.abs(i), Math.abs(j)) === ring) candidates.push({ x: home.x + i * stepX, y: home.y + j * stepY });
      }
    }
    candidates.sort((a, b) => Math.hypot(a.x - home.x, a.y - home.y) - Math.hypot(b.x - home.x, b.y - home.y));
    const spot = candidates.find((candidate) => free({ ...candidate, ...size }, occupied));
    if (spot) return spot;
  }
  return home;
}

// A free place inside a boundary for something of this size, relative to the boundary, below its label and
// clear of the elements it already holds. `ignore` is the element being moved there.
export function freeSpotInside(
  elements: readonly ElementRecord[],
  resolved: ReadonlyMap<string, Resolved>,
  boundary: ElementRecord,
  size: { width: number; height: number },
  ignore: string,
): { x: number; y: number } {
  const area = sizeFor(boundary);
  const occupied = elements
    .filter((element) => element.parent_boundary_id === boundary.id && element.id !== ignore && element.type !== 'data_flow')
    .flatMap((element) => {
      const at = resolved.get(element.id);
      return at ? [{ x: at.x, y: at.y, ...sizeFor(element) }] : [];
    });
  return firstFreeSpot(occupied, size, { x: BOUNDARY_MARGIN, y: BOUNDARY_HEADER }, area.width - BOUNDARY_MARGIN);
}
