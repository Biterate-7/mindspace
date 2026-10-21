"use client";

import { Check, ClipboardCopy, ExternalLink, FileText, Link2, LoaderCircle, PanelLeftClose, Play, Plus, RotateCcw, Search, Square, Trash2, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { IdeaNode } from "@/types/graph";
import type { SearchResult } from "@/types/research";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { Tooltip } from "@/components/ui/Tooltip";
import { sourceListMarkdown } from "@/lib/discovery/exportData";
import { ERROR_LABELS, formatDate, STAGE_LABELS } from "@/lib/discovery/vocabulary";
import { useMindspace } from "@/lib/store";
import { requestRemoveSource, revealNode, startNewResearch } from "@/lib/store/actions";
import type { ResearchTab } from "@/lib/store/types";
import { MAX_SOURCES } from "@/lib/store/researchSlice";
import { ProviderStatus } from "./ProviderStatus";

function useSources(): IdeaNode[] {
  return useMindspace(useShallow((s) => s.nodes.filter((n) => n.data.role === "source")));
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// --- Search -----------------------------------------------------------------------

function ResultRow({ result, selected, imported, onToggle }: { result: SearchResult; selected: boolean; imported: IdeaNode | undefined; onToggle: () => void }) {
  const stage = useMindspace((s) => (imported ? s.jobs[imported.id]?.stage : undefined));
  const [open, setOpen] = useState(false);
  const status = imported ? (stage ? STAGE_LABELS[stage] : imported.data.source?.status === "ready" ? "Imported" : imported.data.source?.status === "failed" ? "Failed" : "Not processed") : null;
  const disabled = Boolean(imported) || Boolean(result.unsupported);
  const date = formatDate(result.publishedAt);
  return (
    <li className={`border-b border-line/70 px-3 py-2.5 ${selected ? "bg-cyan/[0.06]" : ""}`}>
      <div className="flex items-start gap-2.5">
        <label className="relative mt-0.5 flex shrink-0 items-center">
          <input type="checkbox" className="peer sr-only" checked={selected || Boolean(imported)} disabled={disabled} onChange={onToggle} aria-label={`Select ${result.title}`} />
          <span className="flex h-4 w-4 items-center justify-center border border-line-strong bg-void text-void transition-colors peer-checked:border-cyan peer-checked:bg-cyan peer-disabled:opacity-50 peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-accent">
            <Check size={11} strokeWidth={3} />
          </span>
        </label>
        <div className="min-w-0 flex-1">
          <button type="button" className="block w-full text-left text-[13px] font-medium leading-snug text-ink hover:text-cyan" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {result.title}
          </button>
          <p className="font-pixel mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[7px] uppercase tracking-[0.12em] text-ink-3">
            <span className="text-ink-2">{result.domain}</span>
            {date && <span title="Date reported by the search provider">{date}</span>}
            {result.unsupported && <span className="text-gold">{result.unsupported} · not importable</span>}
            {status && (
              <span className={stage ? "text-cyan" : status === "Failed" ? "text-danger" : "text-[#7fe6b5]"}>
                {stage && <LoaderCircle size={8} className="mr-1 inline animate-spin" />}
                {status}
              </span>
            )}
          </p>
          {result.snippet && (
            <p className={`mt-1 text-[12px] leading-snug text-ink-2 ${open ? "" : "line-clamp-2"}`}>
              <span className="sr-only">Search snippet: </span>
              {result.snippet}
            </p>
          )}
          {open && (
            <div className="mt-1.5 flex items-center gap-3">
              <span className="px-caption">Snippet from search · not the article</span>
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11.5px] text-cyan hover:underline">
                Open <ExternalLink size={11} />
              </a>
            </div>
          )}
        </div>
        {!open && (
          <a href={result.url} target="_blank" rel="noopener noreferrer" className="px-icon-btn h-7 w-7 shrink-0" aria-label={`Open ${result.title} in a new tab`} title="Open original in a new tab">
            <ExternalLink size={13} />
          </a>
        )}
      </div>
    </li>
  );
}

function SuggestedSearches({ onSearch }: { onSearch: (query: string) => void }) {
  const suggestions = useMindspace(
    useShallow((s) =>
      s.nodes
        .filter((n) => n.data.role === "concept" && n.data.concept && n.data.concept.type !== "date")
        .sort((a, b) => (b.data.concept?.refs.length ?? 0) - (a.data.concept?.refs.length ?? 0))
        .slice(0, 5)
        .map((n) => n.data.label),
    ),
  );
  if (suggestions.length === 0) return null;
  return (
    <div className="border-t border-line px-3 py-2.5">
      <p className="px-caption mb-1.5">Search further from your concepts</p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((label) => (
          <button key={label} type="button" className="border border-line bg-white/[0.025] px-2 py-0.5 text-[11.5px] text-ink-2 hover:border-line-strong hover:bg-cyan/10 hover:text-ink" onClick={() => onSearch(label)}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchTab() {
  const research = useMindspace((s) => s.current?.research);
  const searchState = useMindspace((s) => s.searchState);
  const config = useMindspace((s) => s.discoveryConfig.value);
  const selected = useMindspace((s) => s.selectedResults);
  const runSearch = useMindspace((s) => s.runSearch);
  const toggleResult = useMindspace((s) => s.toggleResult);
  const setSelected = useMindspace((s) => s.setSelectedResults);
  const importResults = useMindspace((s) => s.importResults);
  const sources = useSources();
  const search = research?.search;
  const [draft, setDraft] = useState<string | null>(null);
  const query = draft ?? search?.query ?? research?.question ?? "";
  const scope = search?.scope ?? (config && !config.web && config.encyclopedia ? "encyclopedia" : "web");
  const byKey = useMemo(() => new Map(sources.map((n) => [n.data.source?.key ?? "", n])), [sources]);
  const importable = (search?.results ?? []).filter((r) => !byKey.has(r.key) && !r.unsupported);
  const searching = searchState.status === "searching";

  const submit = (text = query, nextScope = scope) => {
    setDraft(null);
    void runSearch(text, { scope: nextScope });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="border-b border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-center gap-2 border border-line bg-void/70 pl-2.5 focus-within:border-[rgba(94,227,242,0.5)]">
          <Search size={14} className="shrink-0 text-ink-3" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search for sources"
            aria-label="Search query"
            maxLength={400}
            className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
          <button type="submit" className="px-btn h-9 shrink-0 border-y-0 border-r-0" disabled={searching || !query.trim()}>
            {searching && !searchState.more ? <LoaderCircle size={13} className="animate-spin" /> : "Search"}
          </button>
        </div>
        {config?.web && config.encyclopedia && (
          <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Search scope">
            {(["web", "encyclopedia"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={scope === s}
                onClick={() => submit(query, s)}
                className={`font-pixel h-6 px-2 text-[7px] uppercase tracking-[0.12em] ${scope === s ? "bg-cyan/15 text-ink" : "text-ink-3 hover:text-ink-2"}`}
              >
                {s === "web" ? config.web?.label : config.encyclopedia?.label}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2">
          <ProviderStatus />
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {searchState.status === "error" && (
          <div className="m-3 border border-[rgba(255,122,154,0.35)] bg-[rgba(255,122,154,0.07)] p-2.5 text-[12px] text-[#ffc2d1]" role="alert">
            <p className="flex items-start gap-2">
              <TriangleAlert size={13} className="mt-0.5 shrink-0" />
              <span>{searchState.error}</span>
            </p>
            <p className="mt-1.5 text-ink-3">You can still add sources by URL in the Sources tab.</p>
          </div>
        )}
        {searching && !searchState.more && (
          <p className="flex items-center gap-2 px-3 py-6 text-[12.5px] text-ink-2" role="status">
            <LoaderCircle size={14} className="animate-spin text-cyan" /> Searching {scope === "web" ? config?.web?.label ?? "the web" : config?.encyclopedia?.label ?? "the encyclopedia"}…
          </p>
        )}
        {!searching && !search && searchState.status !== "error" && (
          <div className="px-4 py-8 text-center">
            <PixelIcon name="telescope" scale={3} className="mx-auto text-cyan/70" />
            <p className="mt-3 text-[13px] text-ink-2">Search for sources about your question, then pick the ones worth reading.</p>
          </div>
        )}
        {search && !(searching && !searchState.more) && (
          <>
            <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-2.5">
              <p className="px-caption min-w-0 truncate">
                {search.results.length} result{search.results.length === 1 ? "" : "s"} · {search.provider === "wikipedia" ? "Wikipedia" : search.provider === "brave" ? "Brave Search" : "Tavily"}
              </p>
              {importable.length > 0 && (
                <button type="button" className="shrink-0 text-[11.5px] text-ink-3 hover:text-ink" onClick={() => setSelected(selected.length === importable.length ? [] : importable.map((r) => r.id))}>
                  {selected.length === importable.length ? "Clear" : "Select all"}
                </button>
              )}
            </div>
            {search.results.length === 0 ? (
              <p className="px-3 py-4 text-[12.5px] text-ink-3">No results for “{search.query}”. Try different words.</p>
            ) : (
              <ul>
                {search.results.map((r) => (
                  <ResultRow key={r.id} result={r} selected={selected.includes(r.id)} imported={byKey.get(r.key)} onToggle={() => toggleResult(r.id)} />
                ))}
              </ul>
            )}
            {search.nextOffset !== null && (
              <div className="p-3">
                <button type="button" className="px-btn h-8 w-full text-[12.5px]" onClick={() => void runSearch(undefined, { more: true })} disabled={searching}>
                  {searching && searchState.more ? <LoaderCircle size={13} className="animate-spin" /> : <Plus size={13} />} More results
                </button>
              </div>
            )}
            <SuggestedSearches onSearch={(q) => submit(q)} />
          </>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-line bg-[#05060f]/95 p-3">
          <span className="text-[12px] text-ink-2">
            {selected.length} selected · {sources.length}/{MAX_SOURCES} sources
          </span>
          <button type="button" className="px-btn-primary h-9" onClick={() => importResults(selected)}>
            <PixelIcon name="satellite" scale={1} /> Import {selected.length}
          </button>
        </div>
      )}
    </div>
  );
}

// --- Sources ----------------------------------------------------------------------

function SourceRow({ node }: { node: IdeaNode }) {
  const stage = useMindspace((s) => s.jobs[node.id]?.stage);
  const selected = useMindspace((s) => s.selectedNodeId === node.id);
  const processSource = useMindspace((s) => s.processSource);
  const cancelSource = useMindspace((s) => s.cancelSource);
  const conceptCount = useMindspace((s) => s.nodes.filter((n) => n.data.concept?.refs.some((r) => r.sourceId === node.id)).length);
  const source = node.data.source;
  if (!source) return null;
  const tone = stage ? "text-cyan" : source.status === "failed" ? "text-danger" : source.status === "pending" ? "text-gold" : "text-[#7fe6b5]";
  const status = stage ? STAGE_LABELS[stage] : source.status === "failed" ? (source.error ? ERROR_LABELS[source.error.code] : "Failed") : source.status === "pending" ? "Not processed" : `${conceptCount} concept${conceptCount === 1 ? "" : "s"}`;

  return (
    <li className={`group border-b border-line/70 ${selected ? "bg-accent/[0.07]" : ""}`}>
      <div className="flex items-start gap-2 px-3 py-2.5">
        <span className={`mt-1 flex h-3 w-3 shrink-0 items-center justify-center ${tone}`} aria-hidden="true">
          {stage ? <LoaderCircle size={11} className="animate-spin" /> : <span className="h-1.5 w-1.5 bg-current" />}
        </span>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => revealNode(node.id)}>
          <span className="block truncate text-[13px] text-ink group-hover:text-cyan">{node.data.label}</span>
          <span className="font-pixel mt-0.5 flex flex-wrap gap-x-2 text-[7px] uppercase tracking-[0.12em] text-ink-3">
            <span>{source.domain || (source.textOrigin === "pasted" ? "Pasted text" : "")}</span>
            <span className={tone}>{status}</span>
          </span>
          {source.status === "failed" && source.error && !stage && <span className="mt-1 block text-[11.5px] leading-snug text-ink-3">{source.error.message}</span>}
        </button>
        <div className="flex shrink-0 items-center">
          {stage ? (
            <Tooltip label="Cancel import" side="left">
              <button type="button" className="px-icon-btn h-7 w-7" onClick={() => cancelSource(node.id)} aria-label={`Cancel importing ${node.data.label}`}>
                <Square size={11} />
              </button>
            </Tooltip>
          ) : source.status !== "ready" ? (
            <Tooltip label={source.status === "pending" ? "Process" : "Retry"} side="left">
              <button type="button" className="px-icon-btn h-7 w-7" onClick={() => processSource(node.id)} aria-label={`Retry ${node.data.label}`}>
                {source.status === "pending" ? <Play size={12} /> : <RotateCcw size={12} />}
              </button>
            </Tooltip>
          ) : null}
          {source.url && (
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="px-icon-btn h-7 w-7" aria-label={`Open ${node.data.label} in a new tab`} title="Open original">
              <ExternalLink size={12} />
            </a>
          )}
          <Tooltip label="Remove source" side="left">
            <button type="button" className="px-icon-btn h-7 w-7 hover:!text-danger" onClick={() => requestRemoveSource(node.id)} aria-label={`Remove ${node.data.label}`}>
              <Trash2 size={12} />
            </button>
          </Tooltip>
        </div>
      </div>
    </li>
  );
}

function AddUrls() {
  const addSourceUrls = useMindspace((s) => s.addSourceUrls);
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const submit = () => {
    const result = addSourceUrls(text);
    const parts: string[] = [];
    if (result.added) parts.push(`Importing ${result.added}`);
    if (result.duplicates) parts.push(`${result.duplicates} already imported`);
    if (result.invalid.length) parts.push(`${result.invalid.length} not a valid http(s) URL: ${result.invalid.slice(0, 2).join(", ")}${result.invalid.length > 2 ? "…" : ""}`);
    setFeedback(parts.join(" · ") || "Nothing to add.");
    if (result.added && !result.invalid.length) setText("");
  };
  return (
    <div className="border-b border-line p-3">
      <label htmlFor="add-urls" className="px-caption mb-1.5 flex items-center gap-1.5">
        <Link2 size={11} /> Add websites · one or more URLs
      </label>
      <textarea
        id="add-urls"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !text.includes("\n"))) {
            if (!e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }
        }}
        rows={text.includes("\n") ? 3 : 1}
        placeholder="https://… (Shift+Enter for another line)"
        spellCheck={false}
        className="px-input block resize-none px-2.5 py-2 font-mono text-[12px]"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[11.5px] leading-snug text-ink-3" aria-live="polite">
          {feedback ?? "Public pages only. Fetched by the Mindspace server, never by third parties."}
        </p>
        <button type="button" className="px-btn h-8 shrink-0 text-[12.5px]" onClick={submit} disabled={!text.trim()}>
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

function PasteText({ onDone }: { onDone: () => void }) {
  const addManualSource = useMindspace((s) => s.addManualSource);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  return (
    <div className="border-b border-line bg-white/[0.015] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="px-caption flex items-center gap-1.5">
          <FileText size={11} /> Paste text as a source
        </p>
        <button type="button" className="px-icon-btn h-6 w-6" onClick={onDone} aria-label="Close">
          <X size={12} />
        </button>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={300} aria-label="Source title" className="px-input mb-1.5 h-8 px-2.5 text-[12.5px]" />
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Original URL (optional, for attribution)" aria-label="Source URL" spellCheck={false} className="px-input mb-1.5 h-8 px-2.5 font-mono text-[12px]" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste the article text you have access to…" aria-label="Source text" className="px-input block resize-y px-2.5 py-2 text-[12.5px] leading-relaxed" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-3">Marked as pasted by you. Stays in this browser.</span>
        <button
          type="button"
          className="px-btn h-8 shrink-0 text-[12.5px]"
          disabled={text.trim().length < 80}
          onClick={() => {
            if (addManualSource({ title, url, text })) onDone();
          }}
        >
          Analyse
        </button>
      </div>
    </div>
  );
}

function SourcesTab() {
  const sources = useSources();
  const jobs = useMindspace((s) => s.jobs);
  const processPending = useMindspace((s) => s.processPending);
  const toast = useMindspace((s) => s.toast);
  const [pasting, setPasting] = useState(false);
  const pending = sources.filter((n) => n.data.source?.status === "pending" && !jobs[n.id]).length;
  const active = Object.keys(jobs).length;
  const ordered = [...sources].sort((a, b) => Number(Boolean(jobs[b.id])) - Number(Boolean(jobs[a.id])));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AddUrls />
      {pasting ? (
        <PasteText onDone={() => setPasting(false)} />
      ) : (
        <button type="button" className="flex items-center gap-1.5 border-b border-line px-3 py-2 text-left text-[12px] text-ink-3 hover:text-ink" onClick={() => setPasting(true)}>
          <FileText size={12} /> Paste text instead (for pages that can&apos;t be fetched)
        </button>
      )}
      <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-2.5">
        <p className="px-caption">
          {sources.length}/{MAX_SOURCES} sources{active ? ` · ${active} in progress` : ""}
        </p>
        <div className="flex items-center gap-2">
          {pending > 0 && (
            <button type="button" className="flex items-center gap-1 text-[11.5px] text-gold hover:text-ink" onClick={processPending}>
              <Play size={11} /> Process {pending}
            </button>
          )}
          {sources.length > 0 && (
            <button
              type="button"
              className="flex items-center gap-1 text-[11.5px] text-ink-3 hover:text-ink"
              onClick={async () => {
                const ok = await copyText(sourceListMarkdown(useMindspace.getState().nodes));
                toast(ok ? "Source list copied as Markdown." : "Your browser blocked clipboard access.", { tone: ok ? "success" : "error" });
              }}
            >
              <ClipboardCopy size={11} /> Copy list
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pending > 0 && active === 0 && (
          <p className="mx-3 mb-2 border border-[rgba(245,196,81,0.3)] bg-[rgba(245,196,81,0.06)] px-2.5 py-2 text-[11.5px] leading-snug text-ink-2">
            {pending} source{pending === 1 ? " was" : "s were"} not processed (interrupted or added offline). Press Process to import {pending === 1 ? "it" : "them"}.
          </p>
        )}
        {sources.length === 0 ? (
          <p className="px-3 py-4 text-[12.5px] leading-relaxed text-ink-3">No sources yet. Import search results, add a URL, or paste text.</p>
        ) : (
          <ul>
            {ordered.map((n) => (
              <SourceRow key={n.id} node={n} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Notes ------------------------------------------------------------------------

function NotesTab() {
  const notes = useMindspace((s) => s.current?.research?.notes ?? "");
  const setNotes = useMindspace((s) => s.setResearchNotes);
  const addChild = useMindspace((s) => s.addChild);
  const ideas = useMindspace(useShallow((s) => s.nodes.filter((n) => !n.data.role && n.data.kind !== "core")));
  const coreId = useMindspace((s) => s.nodes.find((n) => n.data.kind === "core" && !n.data.role)?.id ?? null);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="p-3">
        <label htmlFor="research-notes" className="px-caption mb-1.5 block">
          Research notes · yours, stored in this browser
        </label>
        <textarea
          id="research-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={9}
          maxLength={20000}
          placeholder="What are you finding? What still doesn't add up?"
          className="px-input block min-h-[160px] resize-y px-2.5 py-2 text-[13px] leading-relaxed"
        />
      </div>
      <div className="border-t border-line p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="px-caption">My ideas · {ideas.length}</p>
          <button type="button" className="px-btn h-7 text-[12px]" onClick={() => addChild(coreId)}>
            <Plus size={12} /> Add idea
          </button>
        </div>
        {ideas.length === 0 ? (
          <p className="text-[12px] leading-relaxed text-ink-3">Your own thoughts and hypotheses appear here. Add one, then connect it to a concept to record why you think they relate.</p>
        ) : (
          <ul className="flex flex-col">
            {ideas.map((n) => (
              <li key={n.id}>
                <button type="button" className="flex w-full items-center gap-2 py-1 text-left text-[12.5px] text-ink-2 hover:text-ink" onClick={() => revealNode(n.id)}>
                  <span className="h-1.5 w-1.5 shrink-0 bg-[#56DB9C]" aria-hidden="true" />
                  <span className="truncate">{n.data.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --- Panel ------------------------------------------------------------------------

const TABS: Array<{ tab: ResearchTab; label: string }> = [
  { tab: "search", label: "Search" },
  { tab: "sources", label: "Sources" },
  { tab: "notes", label: "Notes" },
];

export function ResearchPanel({ onClose }: { onClose: () => void }) {
  const tab = useMindspace((s) => s.researchTab);
  const setTab = useMindspace((s) => s.setResearchTab);
  const question = useMindspace((s) => s.current?.research?.question ?? "");
  const sourceCount = useMindspace((s) => s.nodes.filter((n) => n.data.role === "source").length);
  const working = useMindspace((s) => Object.keys(s.jobs).length);

  return (
    <aside className="flex h-full w-full flex-col border-r border-line bg-[#05060f]/95 backdrop-blur-md" aria-label="Research">
      <div className="border-b border-line px-3 pb-2.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <p className="px-caption flex items-center gap-1.5 pt-0.5">
            <PixelIcon name="telescope" scale={1} className="text-cyan" /> Research question
          </p>
          <div className="-mr-1.5 -mt-1 flex items-center">
            <Tooltip label="New research" side="bottom">
              <button type="button" className="px-icon-btn h-7 w-7" onClick={startNewResearch} aria-label="Start new research">
                <Plus size={14} />
              </button>
            </Tooltip>
            <button type="button" className="px-icon-btn h-7 w-7" onClick={onClose} aria-label="Hide research panel">
              <PanelLeftClose size={14} />
            </button>
          </div>
        </div>
        <p className="mt-1 text-[13.5px] font-medium leading-snug text-ink">{question}</p>
      </div>
      <div role="tablist" aria-label="Research panel" className="flex shrink-0 border-b border-line">
        {TABS.map(({ tab: t, label }) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`font-pixel relative flex h-9 flex-1 items-center justify-center gap-1.5 text-[8px] uppercase tracking-[0.12em] ${tab === t ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
          >
            {label}
            {t === "sources" && sourceCount > 0 && <span className={working ? "text-cyan" : "text-ink-3"}>{working ? `${working}…` : sourceCount}</span>}
            {tab === t && <span className="absolute inset-x-3 -bottom-px h-0.5 bg-cyan" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="flex min-h-0 flex-1 flex-col">
        {tab === "search" ? <SearchTab /> : tab === "sources" ? <SourcesTab /> : <NotesTab />}
      </div>
    </aside>
  );
}
