import type { ElementRecord } from '../src/index.js';

// A stored element with every column filled, for tests that need one. The same shape the web app's
// diagram tests use.
export const MODEL = '33333333-3333-4333-8333-333333333333';
export const eid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function el(n: number, overrides: Partial<ElementRecord> = {}): ElementRecord {
  return {
    id: eid(n),
    threat_model_id: MODEL,
    type: 'process',
    name: `Element ${n}`,
    properties: {},
    layout: { x: 0, y: 0 },
    source_element_id: null,
    target_element_id: null,
    parent_boundary_id: null,
    created_at: '2026-10-07T10:00:00.000Z',
    updated_at: '2026-10-07T10:00:00.000Z',
    ...overrides,
  };
}
