import { elementOperations } from './elements.js';
import { mitigationOperations } from './mitigations.js';
import type { Operation } from './operation.js';
import { projectOperations } from './projects.js';
import { threatModelOperations } from './threat-models.js';
import { threatOperations } from './threats.js';

// Every resource operation, in the order the contract lists them.
export const resourceOperations: Operation<unknown>[] = [
  ...projectOperations,
  ...threatModelOperations,
  ...elementOperations,
  ...threatOperations,
  ...mitigationOperations,
];
