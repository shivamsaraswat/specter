import { FlowEdge } from '../FlowEdge.js';
import { BoundaryNode } from './BoundaryNode.js';
import { ElementNode } from './ElementNode.js';

// The node type React Flow uses for each element type. The three node types share one component; the
// shape is the class `diagram-node--<type>` in diagram.css. A trust boundary is a container of its own.
export const nodeTypes = {
  external_entity: ElementNode,
  process: ElementNode,
  data_store: ElementNode,
  trust_boundary: BoundaryNode,
};

export const edgeTypes = { flow: FlowEdge };
