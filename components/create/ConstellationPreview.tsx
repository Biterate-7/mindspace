"use client";

import { memo, useMemo, type CSSProperties } from "react";
import type { Graph } from "@/types/graph";
import { PixelSprite } from "@/components/graph/PixelSprite";
import { computeIntroDelays } from "@/lib/graph/intro";
import { CATEGORY_RAMPS } from "@/lib/space/palette";
import { getSprite } from "@/lib/space/sprites";

const PIXEL_SCALE = { core: 2, planet: 2, star: 1, moon: 1 } as const;

/**
 * A miniature, live rendering of the constellation the current input would produce,
 * built from the same generator, layout and sprites as the full canvas.
 */
export const ConstellationPreview = memo(function ConstellationPreview({ graph, size }: { graph: Graph; size: number }) {
  const view = useMemo(() => {
    if (graph.nodes.length === 0) return null;
    const xs = graph.nodes.map((n) => n.position.x);
    const ys = graph.nodes.map((n) => n.position.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scale = Math.min((size - 90) / Math.max(1, maxX - minX), (size - 90) / Math.max(1, maxY - minY), 0.55);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const place = (p: { x: number; y: number }) => ({ x: Math.round((p.x - cx) * scale + size / 2), y: Math.round((p.y - cy) * scale + size / 2) });
    const positions = new Map(graph.nodes.map((n) => [n.id, place(n.position)]));
    const delays = computeIntroDelays(graph.nodes, graph.edges, 0.55);
    return { positions, delays };
  }, [graph, size]);

  if (!view) return null;

  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
      <svg className="absolute inset-0" width={size} height={size}>
        {graph.edges.map((edge) => {
          const a = view.positions.get(edge.source);
          const b = view.positions.get(edge.target);
          if (!a || !b) return null;
          return (
            <line
              key={edge.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              pathLength={1}
              className="ms-draw"
              stroke={edge.data.relation === "related" ? "#7C8CFF" : "#B39CFF"}
              strokeOpacity={edge.data.relation === "related" ? 0.32 : 0.5}
              strokeWidth={1}
              style={{ "--draw-delay": `${view.delays.edges[edge.id] ?? 0}ms` } as CSSProperties}
            />
          );
        })}
      </svg>
      {graph.nodes.map((node) => {
        const p = view.positions.get(node.id);
        if (!p) return null;
        const { kind, category, seed, label } = node.data;
        const sprite = getSprite(kind, category, seed);
        const px = sprite.cells * PIXEL_SCALE[kind];
        return (
          <div
            key={node.id}
            className="ms-appear absolute"
            style={{ left: p.x - px / 2, top: p.y - px / 2, width: px, height: px, "--appear-delay": `${view.delays.nodes[node.id] ?? 0}ms` } as CSSProperties}
          >
            <PixelSprite sprite={sprite} size={px} />
            {(kind === "core" || kind === "planet") && (
              <span
                className={`absolute left-1/2 top-full mt-1 w-max max-w-[150px] -translate-x-1/2 text-center ${kind === "core" ? "text-[12px] font-semibold text-white" : "font-pixel text-[7px] uppercase tracking-[0.12em]"}`}
                style={kind === "planet" ? { color: CATEGORY_RAMPS[category][1] } : undefined}
              >
                {label}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
