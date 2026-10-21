"use client";

import { ChevronDown, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useMindspace } from "@/lib/store";

/** One honest line about what search is available, with setup instructions when web search is missing. */
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
  if (value?.web) {
    return (
      <p className="flex items-center gap-2 text-[12px] text-ink-2">
        <span className="h-1.5 w-1.5 bg-cyan" aria-hidden="true" />
        Web search via <span className="text-ink">{value.web.label}</span>
        {value.encyclopedia && <span className="text-ink-3">· {value.encyclopedia.label} also available</span>}
      </p>
    );
  }
  return (
    <div className="text-[12px] text-ink-2">
      <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="h-1.5 w-1.5 shrink-0 bg-gold" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          Web search is not configured.{" "}
          {value?.encyclopedia ? <>Searching <span className="text-ink">{value.encyclopedia.label}</span> only; </> : null}
          URL import works.
        </span>
        <ChevronDown size={13} className={`shrink-0 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 border border-line bg-void/60 p-2.5 text-[11.5px] leading-relaxed text-ink-3">
          <p>
            To search the whole web, add one key to <code className="text-ink-2">.env.local</code> and restart the server:
          </p>
          <pre className="mt-1.5 overflow-x-auto bg-black/40 px-2 py-1.5 font-mono text-[11px] text-ink-2">{`BRAVE_SEARCH_API_KEY=…   # api-dashboard.search.brave.com
# or
TAVILY_API_KEY=…         # app.tavily.com`}</pre>
          <p className="mt-1.5">Keys stay on the server and are never sent to the browser.</p>
        </div>
      )}
    </div>
  );
}
