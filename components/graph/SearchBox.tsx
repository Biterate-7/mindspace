"use client";

import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useRef } from "react";
import { useMindspace } from "@/lib/store";

/** Search by title or notes. Matches glow on the canvas; Enter cycles through them. */
export function SearchBox() {
  const query = useMindspace((s) => s.searchQuery);
  const matches = useMindspace((s) => s.searchMatches);
  const index = useMindspace((s) => s.searchIndex);
  const selectedId = useMindspace((s) => s.selectedNodeId);
  const setSearch = useMindspace((s) => s.setSearch);
  const stepSearch = useMindspace((s) => s.stepSearch);
  const discovery = useMindspace((s) => s.current?.workspace === "discovery");
  const inputRef = useRef<HTMLInputElement>(null);
  const count = matches?.length ?? 0;
  const position = matches && selectedId && matches.includes(selectedId) ? index + 1 : 0;

  return (
    <div className="px-panel flex h-9 w-full min-w-0 items-center gap-1 pl-2.5 pr-1 focus-within:border-[rgba(179,156,255,0.5)]" role="search">
      <Search size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
      <input
        ref={inputRef}
        id="ms-search"
        type="text"
        value={query}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            stepSearch(e.shiftKey ? -1 : 1);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setSearch("");
            inputRef.current?.blur();
          }
        }}
        placeholder={discovery ? "Search sources, concepts, notes" : "Search ideas"}
        aria-label={discovery ? "Search source titles, domains, concepts, summaries and notes" : "Search ideas by title or notes"}
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
        autoComplete="off"
        spellCheck={false}
      />
      {query ? (
        <>
          <span className="font-pixel shrink-0 px-1 text-[8px] tabular-nums tracking-[0.1em] text-ink-2" aria-live="polite">
            {count === 0 ? "NONE" : position ? `${position}/${count}` : `${count} FOUND`}
          </span>
          <button type="button" className="px-icon-btn h-7 w-6" onClick={() => stepSearch(-1)} disabled={count === 0} aria-label="Previous match">
            <ChevronUp size={14} />
          </button>
          <button type="button" className="px-icon-btn h-7 w-6" onClick={() => stepSearch(1)} disabled={count === 0} aria-label="Next match">
            <ChevronDown size={14} />
          </button>
          <button type="button" className="px-icon-btn h-7 w-7" onClick={() => setSearch("")} aria-label="Clear search">
            <X size={14} />
          </button>
        </>
      ) : (
        <kbd className="px-kbd mr-1 shrink-0" aria-hidden="true">
          /
        </kbd>
      )}
    </div>
  );
}
