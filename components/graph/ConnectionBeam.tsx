"use client";

import type { ConnectionLineComponentProps } from "@xyflow/react";
import type { IdeaNode } from "@/types/graph";
import { spriteSize } from "@/lib/graph/geometry";

/** The beam drawn while dragging a new connection from one body to another. */
export function ConnectionBeam({ fromNode, toX, toY, connectionStatus }: ConnectionLineComponentProps<IdeaNode>) {
  const size = spriteSize(fromNode.data.kind);
  const fromX = fromNode.internals.positionAbsolute.x + (fromNode.measured.width ?? size) / 2;
  const fromY = fromNode.internals.positionAbsolute.y + (fromNode.measured.height ?? size) / 2;
  const valid = connectionStatus === "valid";
  const color = valid ? "#5EE3F2" : "#B39CFF";
  return (
    <g>
      <line x1={fromX} y1={fromY} x2={toX} y2={toY} stroke={color} strokeOpacity={0.25} strokeWidth={6} />
      <line x1={fromX} y1={fromY} x2={toX} y2={toY} stroke={color} strokeWidth={1.5} strokeDasharray="3 3" />
      <rect x={toX - 3} y={toY - 3} width={6} height={6} fill={color} shapeRendering="crispEdges" />
    </g>
  );
}
