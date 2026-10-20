"use client";

import { useStore, useUpdateNodeInternals, type ReactFlowState } from "@xyflow/react";
import { useEffect } from "react";
import type { IdeaNode } from "@/types/graph";
import { spriteSize } from "@/lib/graph/geometry";

/** Ids of nodes React Flow has not measured yet, or whose body size changed (e.g. star -> planet). */
function staleIds(state: ReactFlowState): string {
  let ids = "";
  state.nodeLookup.forEach((node, id) => {
    const expected = spriteSize((node.data as IdeaNode["data"]).kind ?? "star");
    if (!node.measured.width || Math.abs(node.measured.width - expected) > 1 || !node.internals.handleBounds) ids += `${id},`;
  });
  return ids;
}

/**
 * Safety net for node measurement. React Flow measures nodes with a ResizeObserver,
 * which can miss nodes after a re-mount (React Strict Mode, fast refresh) or a change
 * of celestial body. Unmeasured nodes stay invisible, so we re-measure them explicitly.
 */
export function MeasureGuard() {
  const stale = useStore(staleIds);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    if (!stale) return;
    const frame = requestAnimationFrame(() => updateNodeInternals(stale.split(",").filter(Boolean)));
    return () => cancelAnimationFrame(frame);
  }, [stale, updateNodeInternals]);

  return null;
}
