import type { ElementType } from './enums.js';

// What each kind of element is called on screen.
export const TYPE_LABELS: Record<ElementType, string> = {
  external_entity: 'External entity',
  process: 'Process',
  data_store: 'Data store',
  data_flow: 'Data flow',
  trust_boundary: 'Trust boundary',
};
