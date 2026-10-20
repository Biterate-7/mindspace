"use client";

import { Compass, Copy, Plus, Star, Trash2 } from "lucide-react";
import { useMemo } from "react";
import type { MapMeta } from "@/types/graph";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { Tooltip } from "@/components/ui/Tooltip";
import { useMindspace } from "@/lib/store";
import { requestClearAll, requestDeleteMap } from "@/lib/store/actions";

const TIPS = [
  "Paste an article into Text mode — Mindspace keeps your own wording.",
  "Drag from a star's corner port onto another star to connect them.",
  "Double-click empty space to add a new idea right there.",
  "Press Shift + F to lock focus on one idea and its neighbours.",
  "Right-click a connection to change what kind of link it is.",
];

function relativeTime(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days}d` : new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MapRow({ map, active, onOpen }: { map: MapMeta; active: boolean; onOpen: () => void }) {
  const toggleStar = useMindspace((s) => s.toggleStar);
  const duplicateMap = useMindspace((s) => s.duplicateMap);
  return (
    <li className="group relative">
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "page" : undefined}
        className={`flex w-full items-center gap-2.5 border px-2.5 py-2 pr-[84px] text-left transition-colors lg:pr-2.5 lg:group-focus-within:pr-[84px] lg:group-hover:pr-[84px] ${
          active ? "border-[rgba(179,156,255,0.28)] bg-accent/[0.08]" : "border-transparent hover:bg-white/[0.035]"
        }`}
      >
        <span className={`h-1.5 w-1.5 shrink-0 ${active ? "bg-accent" : "bg-ink-3/60"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[13px] ${active ? "text-ink" : "text-ink-2 group-hover:text-ink"}`}>{map.title}</span>
          <span className="font-pixel mt-0.5 block text-[7px] uppercase tracking-[0.14em] text-ink-3">
            {map.nodeCount} stars · {relativeTime(map.updatedAt)}
          </span>
        </span>
      </button>
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
        <Tooltip label={map.starred ? "Remove from saved" : "Save"} side="top">
          <button type="button" className="px-icon-btn h-7 w-7" onClick={() => toggleStar(map.id)} aria-pressed={map.starred} aria-label={`${map.starred ? "Unsave" : "Save"} ${map.title}`}>
            <Star size={13} fill={map.starred ? "currentColor" : "none"} />
          </button>
        </Tooltip>
        <Tooltip label="Duplicate" side="top">
          <button type="button" className="px-icon-btn h-7 w-7" onClick={() => duplicateMap(map.id)} aria-label={`Duplicate ${map.title}`}>
            <Copy size={13} />
          </button>
        </Tooltip>
        <Tooltip label="Delete" side="top">
          <button type="button" className="px-icon-btn h-7 w-7 hover:!text-danger" onClick={() => requestDeleteMap(map.id)} aria-label={`Delete ${map.title}`}>
            <Trash2 size={13} />
          </button>
        </Tooltip>
      </div>
    </li>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const maps = useMindspace((s) => s.maps);
  const currentId = useMindspace((s) => s.current?.id ?? null);
  const createOpen = useMindspace((s) => s.createOpen);
  const openMap = useMindspace((s) => s.openMap);
  const openCreate = useMindspace((s) => s.openCreate);
  const closeCreate = useMindspace((s) => s.closeCreate);
  const persistent = useMindspace((s) => s.storagePersistent);
  const tip = useMemo(() => TIPS[new Date().getDate() % TIPS.length], []);
  const saved = maps.filter((m) => m.starred);
  const currentTitle = maps.find((m) => m.id === currentId)?.title;

  const open = (id: string) => {
    openMap(id);
    onNavigate?.();
  };

  return (
    <nav className="flex h-full w-64 flex-col border-r border-line bg-[#05060f]/94 backdrop-blur-md" aria-label="Maps">
      <div className="p-3">
        <button
          type="button"
          className="px-btn w-full justify-start"
          onClick={() => {
            openCreate();
            onNavigate?.();
          }}
        >
          <Plus size={15} />
          <span className="flex-1 text-left">New mind map</span>
          <kbd className="px-kbd">N</kbd>
        </button>
        <button
          type="button"
          className={`mt-1 flex h-9 w-full items-center gap-2.5 px-3 text-left text-[13px] transition-colors ${!createOpen ? "text-ink" : "text-ink-2 hover:text-ink"}`}
          onClick={() => {
            closeCreate();
            onNavigate?.();
          }}
          aria-current={!createOpen ? "page" : undefined}
        >
          <Compass size={15} className={!createOpen ? "text-accent" : ""} />
          <span className="flex-1 truncate">Explore</span>
          {currentTitle && <span className="font-pixel max-w-[96px] truncate text-[7px] uppercase tracking-[0.12em] text-ink-3">current</span>}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {saved.length > 0 && (
          <section className="mb-4" aria-labelledby="saved-maps">
            <h2 id="saved-maps" className="px-caption mb-1.5 flex items-center gap-2 px-1">
              <PixelIcon name="star" scale={1} className="text-gold" />
              Saved
            </h2>
            <ul className="flex flex-col gap-0.5">
              {saved.map((map) => (
                <MapRow key={map.id} map={map} active={map.id === currentId} onOpen={() => open(map.id)} />
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="recent-maps">
          <h2 id="recent-maps" className="px-caption mb-1.5 flex items-center gap-2 px-1">
            <PixelIcon name="planet" scale={1} className="text-accent" />
            Recent
            <span className="ml-auto text-ink-3">{maps.length}</span>
          </h2>
          {maps.length === 0 ? (
            <p className="px-1 text-[12px] leading-relaxed text-ink-3">Maps you create appear here and stay in this browser.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {maps.map((map) => (
                <MapRow key={map.id} map={map} active={map.id === currentId} onOpen={() => open(map.id)} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="border-t border-line p-3">
        <div className="flex gap-2.5 border border-line bg-white/[0.02] p-2.5">
          <PixelIcon name="satellite" scale={1} className="mt-0.5 shrink-0 text-cyan" />
          <p className="text-[12px] leading-snug text-ink-2">{tip}</p>
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
          <span className={`font-pixel text-[7px] uppercase tracking-[0.12em] ${persistent ? "text-ink-3" : "text-gold"}`}>
            {persistent ? "Stored in this browser" : "Session only · storage blocked"}
          </span>
          {maps.length > 0 && (
            <button type="button" className="text-[11px] text-ink-3 underline-offset-2 hover:text-danger hover:underline" onClick={requestClearAll}>
              Clear local data
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
