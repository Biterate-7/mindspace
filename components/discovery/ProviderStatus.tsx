"use client";

import { ChevronDown, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ProviderKind } from "@/types/research";
import { useMindspace } from "@/lib/store";

const KIND_LABELS: Record<ProviderKind, string> = {
  web: "Web",
  scholarly: "Research",
  news: "News",
  technical: "Technical",
  government: "Government",
  encyclopedia: "Reference",
};

/** One honest line about which sources Discovery searches, with setup help for general web search. */
export function ProviderStatus({ detailed = false }: { detailed?: boolean }) {
  const config = useMindspace((s) => s.discoveryConfig);
  const reload = useMindspace((s) => s.loadDiscoveryConfig);
  const [open, setOpen] = useState(detailed);

  if (config.status === "loading" || config.status === "idle") {
    return <p className="px-caption">Checking search providers…</p>;
  }
  if (config.status === "error") {
    return (
      <p className="flex items-center gap-2 text-[12px] text-[#ffc2d1]" role="alert">
        <TriangleAlert size={13} /> {config.error}
        <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => reload(true)}>
          Retry
        </button>
      </p>
    );
  }
  const value = config.value;
  const providers = value?.providers ?? [];
  if (providers.length === 0) {
    return (
      <p className="flex items-center gap-2 text-[12px] text-ink-2">
        <span className="h-1.5 w-1.5 shrink-0 bg-danger" aria-hidden="true" /> Every search provider is disabled on this server. URL import still works.
      </p>
    );
  }
  const kinds = [...new Set(providers.map((p) => p.kind))];
  return (
    <div className="text-[12px] text-ink-2">
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`h-1.5 w-1.5 shrink-0 ${value?.web ? "bg-cyan" : "bg-gold"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          Searches <span className="text-ink">{providers.length} sources</span> · {kinds.map((k) => KIND_LABELS[k]).join(", ")}
          {!value?.web && <span className="text-ink-3"> · general web search off</span>}
        </span>
        <ChevronDown size={13} className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 border border-line bg-void/60 p-2.5 text-[11.5px] leading-relaxed text-ink-3">
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {providers.map((p) => (
              <li key={p.id} className="text-ink-2">
                {p.label} <span className="text-ink-3">· {KIND_LABELS[p.kind]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2">Each question is turned into several queries and sent only to the indexes that fit its topic. Results are deduplicated and balanced across publishers.</p>
          {!value?.web && (
            <>
              <p className="mt-2">
                For the broadest coverage (any website, not just the indexes above), add one key to <code className="text-ink-2">.env.local</code> and restart the server:
              </p>
              <pre className="mt-1.5 overflow-x-auto bg-black/40 px-2 py-1.5 font-mono text-[11px] text-ink-2">{`BRAVE_SEARCH_API_KEY=…   # api-dashboard.search.brave.com
# or
TAVILY_API_KEY=…         # app.tavily.com`}</pre>
              <p className="mt-1.5">Keys stay on the server and are never sent to the browser.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
