"use client";

import { EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";
import { memo, useState, type CSSProperties } from "react";
import type { IdeaEdge, IdeaNode } from "@/types/graph";
import { isAttribution } from "@/types/graph";
import { edgeGeometry } from "@/lib/graph/edgeGeometry";
import { bodyRadius, spriteSize } from "@/lib/graph/geometry";
import { RELATION_LABELS } from "@/lib/generation/relations";
import { RELATION_COLORS } from "@/lib/space/palette";
import { useMindspace } from "@/lib/store";
import { hashString } from "@/lib/utils/random";
import { useReducedMotion } from "@/lib/utils/motion";

function centerOf(node: InternalNode<IdeaNode>) {
  const size = spriteSize(node.data.kind);
  return {
    x: node.internals.positionAbsolute.x + (node.measured.width ?? size) / 2,
    y: node.internals.positionAbsolute.y + (node.measured.height ?? size) / 2,
  };
}

const DIRECTED = new Set(["causes", "supports", "example", "believes"]);

function CosmicEdgeComponent({ id, source, target, data, selected }: EdgeProps<IdeaEdge>) {
  const sourceNode = useInternalNode<IdeaNode>(source);
  const targetNode = useInternalNode<IdeaNode>(target);
  const emphasis = useMindspace((s) => s.emphasis.edges[id] ?? "n");
  const introDelay = useMindspace((s) => s.intro?.edges[id]);
  const leaving = useMindspace((s) => s.leaving[source] === true || s.leaving[target] === true);
  const selectEdge = useMindspace((s) => s.selectEdge);
  const reducedMotion = useReducedMotion();
  const [drawDelay] = useState(() => introDelay ?? 0);

  if (!sourceNode || !targetNode) return null;
  const relation = data?.relation ?? "related";
  const color = RELATION_COLORS[relation];
  const geometry = edgeGeometry(id, centerOf(sourceNode), centerOf(targetNode), bodyRadius(sourceNode.data.kind), bodyRadius(targetNode.data.kind));
  const highlighted = emphasis.includes("h") || Boolean(selected);
  const hash = hashString(id);
  const attribution = isAttribution(relation);
  const review = attribution ? undefined : data?.review;
  const pulses = !reducedMotion && (highlighted || (!attribution && hash % 4 === 0));
  const duration = highlighted ? 3.2 : 7 + (hash % 5);
  const begin = highlighted ? 0 : (hash % 60) / 10;
  // Attribution is a faint dotted signal line; unreviewed suggestions and hypotheses are dashed.
  const dash = attribution ? "1.5 4" : review === "unreviewed" ? "6 4" : review === "hypothesis" ? "2 3" : relation === "contrasts" ? "5 4" : undefined;
  const dashed = dash !== undefined;
  // Generic links stay unlabelled unless the connection itself is selected; typed links always say what they are.
  const showLabel = attribution ? Boolean(selected) || emphasis.includes("h") : relation !== "related" || Boolean(selected) || review === "hypothesis";
  const baseOpacity = attribution ? 0.3 : relation === "related" ? 0.34 : 0.5;
  const labelText = `${review === "hypothesis" ? "Hypothesis · " : ""}${RELATION_LABELS[relation]}${review === "unreviewed" ? " ?" : ""}`;

  return (
    <>
      <g className="ms-edge" data-emph={emphasis} style={{ opacity: leaving ? 0 : undefined, transition: "opacity 200ms ease" }}>
        <path d={geometry.d} fill="none" stroke="transparent" strokeWidth={18} className="react-flow__edge-interaction" />
        <path
          d={geometry.d}
          pathLength={dashed ? undefined : 1}
          className={`ms-edge-path ${dashed ? "ms-fade-in" : "ms-draw"}`}
          data-attribution={attribution ? "true" : undefined}
          style={{ stroke: color, strokeOpacity: baseOpacity, strokeWidth: attribution ? 1.2 : 1.4, strokeDasharray: dash, "--draw-delay": `${drawDelay}ms` } as CSSProperties}
        />
        <g className="ms-fade-in" style={{ "--draw-delay": `${drawDelay + 500}ms` } as CSSProperties}>
          {!attribution &&
            geometry.sparks.map((p, i) => (
              <rect key={i} x={Math.round(p.x) - 1} y={Math.round(p.y) - 1} width={2} height={2} fill={color} fillOpacity={highlighted ? 0.9 : 0.45} />
            ))}
          {DIRECTED.has(relation) && (
            <g transform={`translate(${geometry.head.x} ${geometry.head.y}) rotate(${geometry.head.angle})`}>
              <path d="M-4 -4h2v2h-2zM-2 -2h2v2h-2zM0 -1h1v2h-1zM-2 0h2v2h-2zM-4 2h2v2h-2z" fill={color} fillOpacity={highlighted ? 1 : 0.7} shapeRendering="crispEdges" />
            </g>
          )}
        </g>
        {pulses && (
          <rect className="ms-noexport" x={-1.5} y={-1.5} width={3} height={3} fill="#FFFFFF" opacity={0}>
            <animateMotion path={geometry.d} dur={`${duration}s`} begin={`${begin}s`} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.42;1" calcMode="linear" />
            <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.36;0.42;1" dur={`${duration}s`} begin={`${begin}s`} repeatCount="indefinite" />
          </rect>
        )}
      </g>
      {showLabel && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="ms-edge-label nodrag nopan"
            data-emph={emphasis}
            data-selected={selected ? "true" : "false"}
            style={{ transform: `translate(-50%, -50%) translate(${geometry.mid.x}px, ${geometry.mid.y}px)`, "--relation-color": color } as CSSProperties}
            onClick={() => selectEdge(id)}
            aria-label={`Connection: ${sourceNode.data.label} ${RELATION_LABELS[relation]} ${targetNode.data.label}${review === "unreviewed" ? " (unreviewed suggestion)" : review === "hypothesis" ? " (hypothesis)" : ""}`}
          >
            <span className="ms-fade-in block" style={{ "--draw-delay": `${drawDelay + 450}ms` } as CSSProperties}>
              {labelText}
            </span>
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const CosmicEdge = memo(CosmicEdgeComponent);
