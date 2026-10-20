"use client";

import { useSyncExternalStore } from "react";
import { useMindspace } from "@/lib/store";
import { hashString } from "@/lib/utils/random";
import { pointerStore } from "@/lib/utils/pointer";

function Coordinates() {
  const point = useSyncExternalStore(pointerStore.subscribe, pointerStore.get, () => null);
  if (!point) return null;
  return (
    <span className="tabular-nums text-ink-3">
      X {Math.round(point.x)} · Y {Math.round(point.y)}
    </span>
  );
}

/** Real telemetry only: sector id derived from the map, live counts, cursor coordinates. */
export function StatusBar() {
  const mapId = useMindspace((s) => s.current?.id ?? "");
  const nodeCount = useMindspace((s) => s.nodes.length);
  const edgeCount = useMindspace((s) => s.edges.length);
  const focusMode = useMindspace((s) => s.focusMode);
  const sector = (hashString(mapId) % 4096).toString(16).toUpperCase().padStart(3, "0");

  return (
    <div className="font-pixel pointer-events-none flex items-center gap-3 text-[8px] uppercase tracking-[0.14em] text-ink-2" aria-label="Map status">
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 ${focusMode ? "bg-gold" : "bg-cyan"}`} aria-hidden="true" />
        Sector {sector}
      </span>
      <span>
        {nodeCount} {nodeCount === 1 ? "star" : "stars"} · {edgeCount} {edgeCount === 1 ? "link" : "links"}
      </span>
      {focusMode && <span className="text-gold">Focus lock</span>}
      <Coordinates />
    </div>
  );
}
