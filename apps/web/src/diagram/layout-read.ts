import { boundaryLayoutSchema, elementLayoutSchema, type ElementRecord } from '@specter/core';

// Reads the layout stored on an element, which may be anything for a row written before the layout
// had a shape (research #3): what is not valid for the element's type counts as not placed.

export function positionOf(element: ElementRecord): { x: number; y: number } | null {
  const layout = elementLayoutSchema(element.type).safeParse(element.layout);
  return layout.success && layout.data !== null ? { x: layout.data.x, y: layout.data.y } : null;
}

// A trust boundary's stored size, if it has a valid one.
export function sizeOf(element: ElementRecord): { width: number; height: number } | null {
  if (element.type !== 'trust_boundary') return null;
  const layout = boundaryLayoutSchema.safeParse(element.layout);
  return layout.success ? { width: layout.data.width, height: layout.data.height } : null;
}
