"use client";

import { useReactFlow, useStore } from "@xyflow/react";
import { Locate, Map as MapIcon, Maximize, Minus, Plus } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { useMindspace } from "@/lib/store";

/** Zoom, fit, reset and minimap controls (bottom-right of the canvas). */
export function CanvasControls({ compact = false }: { compact?: boolean }) {
  const flow = useReactFlow();
  const zoom = useStore((s) => Math.round(s.transform[2] * 100));
  const minimapOpen = useMindspace((s) => s.minimapOpen);
  const toggleMinimap = useMindspace((s) => s.toggleMinimap);

  const resetView = () => {
    const core = useMindspace.getState().nodes.find((n) => n.data.kind === "core");
    if (core) void flow.setCenter(core.position.x, core.position.y, { zoom: 1, duration: 450 });
    else void flow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 450 });
  };

  if (compact) {
    return (
      <div className="px-panel flex items-center p-0.5" role="toolbar" aria-label="Viewport controls">
        <button type="button" className="px-icon-btn h-8 w-8" onClick={() => void flow.fitView({ padding: 0.12, duration: 400, minZoom: 0.4, maxZoom: 1.15 })} aria-label="Fit graph to view">
          <Maximize size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="px-panel flex items-center p-0.5" role="toolbar" aria-label="Viewport controls">
      <Tooltip label="Zoom out" shortcut="−" side="top">
        <button type="button" className="px-icon-btn h-8 w-8" onClick={() => void flow.zoomOut({ duration: 200 })} aria-label="Zoom out">
          <Minus size={15} />
        </button>
      </Tooltip>
      <Tooltip label="Reset to 100%" shortcut="0" side="top">
        <button type="button" className="font-pixel h-8 min-w-[46px] px-1 text-[9px] text-ink-2 hover:text-ink" onClick={resetView} aria-label={`Zoom ${zoom}%. Reset view`}>
          {zoom}%
        </button>
      </Tooltip>
      <Tooltip label="Zoom in" shortcut="+" side="top">
        <button type="button" className="px-icon-btn h-8 w-8" onClick={() => void flow.zoomIn({ duration: 200 })} aria-label="Zoom in">
          <Plus size={15} />
        </button>
      </Tooltip>
      <span className="mx-0.5 h-5 w-px bg-line" aria-hidden="true" />
      <Tooltip label="Fit galaxy to view" shortcut="F" side="top">
        <button type="button" className="px-icon-btn h-8 w-8" onClick={() => void flow.fitView({ padding: 0.16, duration: 500, maxZoom: 1.15 })} aria-label="Fit graph to view">
          <Maximize size={15} />
        </button>
      </Tooltip>
      <Tooltip label="Center on core" side="top">
        <button type="button" className="px-icon-btn h-8 w-8" onClick={resetView} aria-label="Reset viewport to the core idea">
          <Locate size={15} />
        </button>
      </Tooltip>
      <Tooltip label={minimapOpen ? "Hide minimap" : "Show minimap"} shortcut="M" side="top">
        <button type="button" className="px-icon-btn h-8 w-8" onClick={toggleMinimap} aria-pressed={minimapOpen} aria-label="Toggle minimap">
          <MapIcon size={15} />
        </button>
      </Tooltip>
    </div>
  );
}
