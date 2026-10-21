"use client";

import { ClipboardCopy, Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { contentStore } from "@/lib/discovery/contentStore";
import { buildResearchExport, exportJsonFileName, sourceListMarkdown } from "@/lib/discovery/exportData";
import { downloadBlob } from "@/lib/export/png";
import { useMindspace } from "@/lib/store";

function Check({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 accent-[#b39cff]" />
      <span>
        <span className="block text-[13.5px] text-ink">{label}</span>
        <span className="block text-[12px] leading-snug text-ink-3">{description}</span>
      </span>
    </label>
  );
}

/** Structured JSON export and source list for a research workspace. */
export function DataExport({ onClose }: { onClose: () => void }) {
  const toast = useMindspace((s) => s.toast);
  const sourceCount = useMindspace((s) => s.nodes.filter((n) => n.data.role === "source").length);
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includePassages, setIncludePassages] = useState(false);
  const [includeText, setIncludeText] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const state = useMindspace.getState();
    if (!state.current) return;
    setBusy(true);
    try {
      let articleText: Record<string, string> | undefined;
      if (includeText) {
        articleText = {};
        for (const node of state.nodes.filter((n) => n.data.role === "source")) {
          const entry = await contentStore().get(state.current.id, node.id).catch(() => null);
          if (entry) articleText[node.id] = entry.text;
        }
      }
      const data = buildResearchExport(state.current, state.nodes, state.edges, { includeNotes, includePassages, articleText });
      const name = exportJsonFileName(state.current.title);
      downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), name);
      toast(`Exported ${name}`, { tone: "success" });
      onClose();
    } catch {
      toast("The data export failed. Try again.", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="px-5 py-2">
        <p className="py-2 text-[12.5px] leading-relaxed text-ink-2">Ideas, sources (titles, links, dates), concepts with their source references, and every link with its review status.</p>
        <Check label="Include my notes" description="Notes on ideas and concepts, link rationales, and your research notes." checked={includeNotes} onChange={setIncludeNotes} />
        <Check label="Include quoted source content" description="Summaries, passages and evidence quoted from the articles. Leave off if you will share the file publicly." checked={includePassages} onChange={setIncludePassages} />
        <Check label="Include full article text" description="The text stored in this browser for each source. Only for your own archive." checked={includeText} onChange={setIncludeText} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
        <button
          type="button"
          className="px-btn h-8 text-[12.5px]"
          disabled={sourceCount === 0}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(sourceListMarkdown(useMindspace.getState().nodes));
              toast("Source list copied as Markdown.", { tone: "success" });
            } catch {
              toast("Your browser blocked clipboard access.", { tone: "error" });
            }
          }}
        >
          <ClipboardCopy size={13} /> Copy source list
        </button>
        <div className="flex gap-2">
          <button type="button" className="px-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="px-btn-primary h-8" onClick={run} disabled={busy}>
            {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
            Export JSON
          </button>
        </div>
      </div>
    </>
  );
}
