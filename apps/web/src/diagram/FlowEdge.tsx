import { BaseEdge, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import { curvedPath, type FlowEdgeData } from './flow.js';

// A data flow: an arrow from its source to its target, named, bowed when it shares its two ends with
// another flow so that neither covers the other.
export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  label,
  data,
  interactionWidth,
}: EdgeProps<Edge<FlowEdgeData>>) {
  const curve = data?.curve ?? 0;
  const [path, labelX, labelY] =
    curve === 0
      ? getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
      : curvedPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, curve);
  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelBgPadding={[4, 2]}
      labelBgBorderRadius={2}
      interactionWidth={interactionWidth}
    />
  );
}
