"use client";

import { useNodesInitialized, useReactFlow, useStore } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { useMindspace } from "@/lib/store";
import { prefersReducedMotion } from "@/lib/utils/motion";

/** Executes camera requests from the store (fit, center, restore) once nodes are measured. */
export function CameraController() {
  const camera = useMindspace((s) => s.camera);
  const nodeCount = useMindspace((s) => s.nodes.length);
  const initialized = useNodesInitialized();
  // d3-zoom is attached in React Flow's own effect; camera calls before that are silently dropped.
  const ready = useStore((s) => s.panZoom !== null && s.width > 0);
  const flow = useReactFlow();
  const handled = useRef<number | null>(null);

  useEffect(() => {
    if (!camera || handled.current === camera.nonce || !ready) return;
    if (camera.type !== "viewport" && nodeCount > 0 && !initialized) return;
    handled.current = camera.nonce;
    const reduced = prefersReducedMotion();
    const duration = (ms: number | undefined) => (reduced ? 0 : (ms ?? 450));

    if (camera.type === "viewport") {
      void flow.setViewport(camera.viewport, { duration: 0 });
      return;
    }
    if (camera.type === "center") {
      const node = flow.getInternalNode(camera.id);
      if (!node) return;
      const x = node.internals.positionAbsolute.x + (node.measured.width ?? 0) / 2;
      const y = node.internals.positionAbsolute.y + (node.measured.height ?? 0) / 2;
      const zoom = Math.max(flow.getZoom(), camera.zoom ?? 0.9);
      void flow.setCenter(x, y, { zoom, duration: duration(500) });
      return;
    }
    const nodes = camera.ids?.map((id) => ({ id }));
    // On phones a whole galaxy would shrink to specks; keep labels legible and let people pan.
    const minZoom = window.innerWidth < 640 ? 0.42 : undefined;
    if (camera.intro && !reduced) {
      // Start wide, then settle into the galaxy as it forms.
      void flow.fitView({ padding: 0.9, duration: 0 }).then(() => flow.fitView({ padding: 0.16, duration: camera.duration ?? 1400, maxZoom: 1.15, minZoom }));
      return;
    }
    void flow.fitView({ nodes, padding: nodes ? 0.4 : 0.16, duration: duration(camera.duration), maxZoom: nodes ? 1.35 : 1.15, minZoom });
  }, [camera, initialized, nodeCount, flow, ready]);

  return null;
}
