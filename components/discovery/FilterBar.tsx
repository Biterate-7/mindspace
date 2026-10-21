"use client";

import { isUnreviewed } from "@/lib/discovery/merge";
import { ROLE_COLORS } from "@/lib/space/palette";
import { useMindspace } from "@/lib/store";
import type { ResearchFilter } from "@/lib/store/types";

const FILTERS: Array<{ id: ResearchFilter; label: string; color?: string }> = [
  { id: "all", label: "All" },
  { id: "ideas", label: "My ideas", color: ROLE_COLORS.idea },
  { id: "sources", label: "Sources", color: ROLE_COLORS.source },
  { id: "concepts", label: "Concepts", color: ROLE_COLORS.concept },
  { id: "unreviewed", label: "Unreviewed", color: "#F5C451" },
];

/** Discovery filters. Non-matching nodes fade back rather than vanish, so context stays visible. */
export function FilterBar({ compact = false }: { compact?: boolean }) {
  const filter = useMindspace((s) => s.researchFilter);
  const setFilter = useMindspace((s) => s.setResearchFilter);
  const unreviewed = useMindspace((s) => s.edges.filter(isUnreviewed).length);

  if (compact) {
    return (
      <select
        value={filter}
        onChange={(e) => setFilter(e.target.value as ResearchFilter)}
        aria-label="Filter the galaxy"
        className="px-panel font-pixel pointer-events-auto h-9 w-[92px] shrink-0 px-1.5 text-[8px] uppercase tracking-[0.1em] text-ink outline-none"
      >
        {FILTERS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
            {f.id === "unreviewed" ? ` (${unreviewed})` : ""}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="px-panel pointer-events-auto flex items-center p-0.5" role="radiogroup" aria-label="Filter the galaxy">
      {FILTERS.map((f) => {
        const active = filter === f.id;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setFilter(active && f.id !== "all" ? "all" : f.id)}
            className={`font-pixel flex h-8 items-center gap-1.5 px-2.5 text-[8px] uppercase tracking-[0.12em] transition-colors ${active ? "bg-accent/15 text-ink" : "text-ink-3 hover:text-ink-2"}`}
          >
            {f.color && <span className="h-1.5 w-1.5" style={{ background: f.color }} aria-hidden="true" />}
            {f.label}
            {f.id === "unreviewed" && unreviewed > 0 && <span className="text-gold">{unreviewed}</span>}
          </button>
        );
      })}
    </div>
  );
}
