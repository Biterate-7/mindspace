"use client";

import { Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { RELATIONS, RESEARCH_RELATIONS, type Relation } from "@/types/graph";
import { RELATION_LABELS } from "@/lib/generation/relations";
import { neighborIds } from "@/lib/graph/ops";
import { RELATION_COLORS } from "@/lib/space/palette";
import { useMindspace } from "@/lib/store";

/** Searchable list for linking the selected idea to another one, without dragging. */
export function ConnectPicker({ sourceId }: { sourceId: string }) {
  const nodes = useMindspace((s) => s.nodes);
  const edges = useMindspace((s) => s.edges);
  const connectNodes = useMindspace((s) => s.connectNodes);
  const connectResearch = useMindspace((s) => s.connectResearch);
  const startLink = useMindspace((s) => s.startLink);
  const discovery = useMindspace((s) => s.current?.workspace === "discovery");
  const [query, setQuery] = useState("");
  const [relation, setRelation] = useState<Relation>("related");
  const [hypothesis, setHypothesis] = useState(false);
  const [rationale, setRationale] = useState("");
  const choices = discovery ? RESEARCH_RELATIONS : RELATIONS;
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const options = useMemo(() => {
    const connected = neighborIds(edges, sourceId);
    const q = query.trim().toLowerCase();
    return nodes
      .filter((n) => n.id !== sourceId && (!q || n.data.label.toLowerCase().includes(q)))
      .map((n) => ({ id: n.id, label: n.data.label, connected: connected.has(n.id) }))
      .sort((a, b) => Number(a.connected) - Number(b.connected))
      .slice(0, 60);
  }, [nodes, edges, sourceId, query]);

  const choose = (id: string) => {
    if (discovery) {
      // Your own links in Discovery count as reviewed, or as a hypothesis when you say so.
      const extra = { review: hypothesis ? ("hypothesis" as const) : ("accepted" as const), ...(rationale.trim() ? { rationale: rationale.trim() } : {}) };
      if (connectResearch(sourceId, id, relation, extra)) startLink(null);
      return;
    }
    if (connectNodes(sourceId, id, relation)) startLink(null);
  };

  return (
    <div className="border border-[rgba(94,227,242,0.35)] bg-[#04101a]/60 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="px-caption !text-cyan">Connect to…</p>
        <button type="button" className="px-icon-btn h-6 w-6" onClick={() => startLink(null)} aria-label="Cancel connecting">
          <X size={13} />
        </button>
      </div>
      <p className="mb-2 text-[11.5px] leading-snug text-ink-3">Pick an idea below, or click any star on the canvas.</p>
      <div className="mb-2 flex items-center gap-2 border border-line bg-void/70 px-2">
        <Search size={13} className="text-ink-3" aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            const enabled = options.filter((o) => !o.connected);
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(enabled.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && enabled[active]) {
              e.preventDefault();
              choose(enabled[active].id);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              startLink(null);
            }
          }}
          placeholder="Find an idea"
          aria-label="Find an idea to connect to"
          className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>
      <label className="mb-2 flex items-center gap-2 text-[12px] text-ink-2">
        <span className="shrink-0">as</span>
        <select
          value={relation}
          onChange={(e) => setRelation(e.target.value as Relation)}
          className="font-pixel h-7 flex-1 border border-line bg-void px-1.5 text-[8px] uppercase tracking-[0.1em] outline-none focus:border-accent"
          style={{ color: RELATION_COLORS[relation] }}
          aria-label="Relationship type"
        >
          {choices.map((r) => (
            <option key={r} value={r}>
              {RELATION_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      {discovery && (
        <div className="mb-2 flex flex-col gap-1.5">
          <input
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            maxLength={1000}
            placeholder="Why do you think they're connected? (optional)"
            aria-label="Why they are connected"
            className="h-7 border border-line bg-void/70 px-2 text-[12px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
          />
          <label className="flex items-center gap-2 text-[12px] text-ink-2">
            <input type="checkbox" checked={hypothesis} onChange={(e) => setHypothesis(e.target.checked)} className="accent-[#b39cff]" />
            Mark as a hypothesis
          </label>
        </div>
      )}
      <ul ref={listRef} className="max-h-48 overflow-y-auto" role="listbox" aria-label="Ideas">
        {options.length === 0 && <li className="px-2 py-1.5 text-[12px] text-ink-3">No matching ideas.</li>}
        {options.map((option) => {
          const enabledIndex = options.filter((o) => !o.connected).findIndex((o) => o.id === option.id);
          return (
            <li key={option.id} role="option" aria-selected={enabledIndex === active} aria-disabled={option.connected}>
              <button
                type="button"
                disabled={option.connected}
                onClick={() => choose(option.id)}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12.5px] transition-colors ${
                  option.connected ? "cursor-default text-ink-3" : enabledIndex === active ? "bg-cyan/10 text-ink" : "text-ink-2 hover:bg-white/5 hover:text-ink"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.connected && <span className="font-pixel text-[7px] uppercase tracking-[0.1em]">linked</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
