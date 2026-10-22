"use client";

import { ArrowLeftRight, Check, Crosshair, ExternalLink, FileText, Link2, LoaderCircle, Play, Plus, RefreshCw, RotateCcw, Trash2, TriangleAlert, Unlink } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { isAttribution, RESEARCH_RELATIONS, type IdeaData } from "@/types/graph";
import { CONCEPT_TYPES, type ConceptType, type EdgeReview } from "@/types/research";
import { PixelSprite } from "@/components/graph/PixelSprite";
import { ConnectPicker } from "@/components/workspace/ConnectPicker";
import { contentStore } from "@/lib/discovery/contentStore";
import { hasTension, isUnreviewed } from "@/lib/discovery/merge";
import { ERROR_LABELS, formatDate, PROVIDER_LABELS, RELATION_HINTS, REVIEW_HINTS, REVIEW_LABELS, STAGE_LABELS } from "@/lib/discovery/vocabulary";
import { RELATION_LABELS } from "@/lib/generation/relations";
import { labelKey } from "@/lib/generation/text";
import { CONCEPT_TYPE_LABELS, RELATION_COLORS, ROLE_COLORS } from "@/lib/space/palette";
import { getRoleSprite } from "@/lib/space/sprites";
import { useMindspace } from "@/lib/store";
import { focusOn, requestDeleteNodes, requestRemoveSource, revealNode, startConnect } from "@/lib/store/actions";
import { PASTE_FALLBACK } from "@/lib/store/researchSlice";
import { SourceBadges } from "./SourceBadges";

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="px-caption">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Quote({ children, source }: { children: ReactNode; source?: ReactNode }) {
  return (
    <blockquote className="border-l-2 border-cyan/40 bg-white/[0.02] py-1.5 pl-2.5 pr-2 text-[12.5px] leading-relaxed text-ink-2">
      “{children}”{source && <span className="mt-1 block text-[11px] not-italic text-ink-3">— {source}</span>}
    </blockquote>
  );
}

function NotesField({ id, notes, placeholder }: { id: string; notes: string; placeholder: string }) {
  const updateNode = useMindspace((s) => s.updateNode);
  return (
    <textarea
      value={notes}
      onChange={(e) => updateNode(id, { notes: e.target.value })}
      placeholder={placeholder}
      rows={3}
      maxLength={4000}
      aria-label="Your notes"
      className="px-input min-h-[72px] resize-y px-2.5 py-2 text-[13px] leading-relaxed text-ink-2 [field-sizing:content] focus:text-ink"
    />
  );
}

function ApproximateNotice() {
  return (
    <p className="mt-2 flex gap-1.5 text-[11px] leading-snug text-ink-3">
      <TriangleAlert size={11} className="mt-px shrink-0 text-gold" />
      Found with local keyword statistics — an approximation, not semantic understanding. Check passages before relying on a concept.
    </p>
  );
}

// --- Source -------------------------------------------------------------------------

function StoredText({ sourceId }: { sourceId: string }) {
  const mapId = useMindspace((s) => s.current?.id ?? "");
  const removeContent = useMindspace((s) => s.removeSourceContent);
  const version = useMindspace((s) => s.version);
  const [state, setState] = useState<{ words: number } | null | "loading">("loading");
  useEffect(() => {
    let alive = true;
    contentStore()
      .get(mapId, sourceId)
      .then((entry) => alive && setState(entry ? { words: entry.text.split(/\s+/).length } : null))
      .catch(() => alive && setState(null));
    return () => {
      alive = false;
    };
  }, [mapId, sourceId, version]);
  if (state === "loading") return null;
  return (
    <div className="flex items-center justify-between gap-2 text-[12px] text-ink-2">
      {state ? (
        <>
          <span>Article text stored in this browser · {state.words.toLocaleString()} words</span>
          <button
            type="button"
            className="shrink-0 text-[11.5px] text-ink-3 underline-offset-2 hover:text-danger hover:underline"
            onClick={async () => {
              await removeContent(sourceId);
              setState(null);
            }}
          >
            Remove text
          </button>
        </>
      ) : (
        <span className="text-ink-3">No article text stored. Re-analysing will fetch the page again.</span>
      )}
    </div>
  );
}

function PasteForSource({ sourceId, onDone }: { sourceId: string; onDone: () => void }) {
  const setManualText = useMindspace((s) => s.setManualText);
  const [text, setText] = useState("");
  return (
    <div className="mt-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste the article text you can see in your browser…" aria-label="Paste article text" className="px-input block resize-y px-2.5 py-2 text-[12.5px] leading-relaxed" />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-3">Recorded as pasted by you, attributed to this URL.</span>
        <div className="flex gap-1.5">
          <button type="button" className="px-btn h-7 text-[12px]" onClick={onDone}>
            Cancel
          </button>
          <button
            type="button"
            className="px-btn h-7 text-[12px]"
            disabled={text.trim().length < 80}
            onClick={async () => {
              await setManualText(sourceId, text);
              onDone();
            }}
          >
            Analyse
          </button>
        </div>
      </div>
    </div>
  );
}

export function SourceInspector({ id, data }: { id: string; data: IdeaData }) {
  const source = data.source!;
  const stage = useMindspace((s) => s.jobs[id]?.stage);
  const processSource = useMindspace((s) => s.processSource);
  const cancelSource = useMindspace((s) => s.cancelSource);
  const concepts = useMindspace(useShallow((s) => s.nodes.filter((n) => n.data.concept?.refs.some((r) => r.sourceId === id))));
  const claims = useMindspace(useShallow((s) => s.nodes.filter((n) => n.data.claim?.sourceIds.includes(id))));
  const [pasting, setPasting] = useState(false);
  const published = formatDate(source.publishedAt);
  const retrieved = formatDate(source.retrievedAt);
  const sprite = useMemo(() => getRoleSprite(data), [data]);
  const authors = source.authors?.length ? `${source.authors.slice(0, 4).join(", ")}${source.authors.length > 4 ? ` and ${source.authors.length - 4} more` : ""}` : source.byline;

  return (
    <div className="pb-4">
      <div className="px-4 pb-3.5 pt-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">
            <PixelSprite sprite={sprite} size={42} />
          </span>
          <div className="min-w-0">
            <p className="px-caption mb-1">Source · {source.siteName ?? source.domain ?? "pasted text"}</p>
            <h2 className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-ink">{data.label}</h2>
            {authors && <p className="mt-0.5 text-[12px] text-ink-3">{authors}</p>}
            {source.venue && <p className="mt-0.5 text-[12px] italic text-ink-3">{source.venue}</p>}
            {(source.category || source.sourceRole) && (
              <p className="font-pixel mt-1.5 flex flex-wrap gap-x-2 text-[7px] uppercase tracking-[0.12em]">
                <SourceBadges category={source.category} role={source.sourceRole} preprint={source.preprint} />
              </p>
            )}
          </div>
        </div>
        {source.url && (
          <a href={source.canonicalUrl ?? source.url} target="_blank" rel="noopener noreferrer" className="px-btn mt-3 h-8 w-full justify-start text-[12.5px]">
            <ExternalLink size={13} />
            <span className="min-w-0 flex-1 truncate text-left">Open original · {source.domain}</span>
          </a>
        )}
        {source.doi && (
          <a href={`https://doi.org/${source.doi}`} target="_blank" rel="noopener noreferrer" className="mt-1.5 block truncate text-[11.5px] text-ink-3 hover:text-cyan hover:underline">
            DOI {source.doi}
          </a>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-px border border-line bg-line text-[12px]">
          <div className="bg-[#070818] p-2">
            <dt className="px-caption">Published</dt>
            <dd className="mt-0.5 text-ink-2" title={source.publishedFrom === "search" ? "Date reported by the search provider" : source.publishedFrom === "page" ? "Date from the page's own metadata" : undefined}>
              {published ?? "Unknown"}
              {published && <span className="block text-[10.5px] text-ink-3">{source.publishedFrom === "search" ? "per search provider" : "per page metadata"}</span>}
            </dd>
          </div>
          <div className="bg-[#070818] p-2">
            <dt className="px-caption">Retrieved</dt>
            <dd className="mt-0.5 text-ink-2">
              {retrieved ?? "Not yet"}
              {source.wordCount ? <span className="block text-[10.5px] text-ink-3">{source.wordCount.toLocaleString()} words{source.textOrigin === "pasted" ? " · pasted by you" : ""}</span> : null}
            </dd>
          </div>
        </dl>
      </div>

      <Section title="Status">
        {stage ? (
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[12.5px] text-cyan" role="status">
              <LoaderCircle size={13} className="animate-spin" /> {STAGE_LABELS[stage]}…
            </p>
            <button type="button" className="px-btn h-7 text-[12px]" onClick={() => cancelSource(id)}>
              Cancel
            </button>
          </div>
        ) : source.status === "failed" ? (
          <div>
            <p className="text-[12.5px] text-[#ffc2d1]">
              <span className="font-medium">{source.error ? ERROR_LABELS[source.error.code] : "Import failed"}.</span> {source.error?.message}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" className="px-btn h-7 text-[12px]" onClick={() => processSource(id, { refetch: true })}>
                <RotateCcw size={12} /> Retry
              </button>
              {(!source.error || PASTE_FALLBACK.has(source.error.code)) && !pasting && (
                <button type="button" className="px-btn h-7 text-[12px]" onClick={() => setPasting(true)}>
                  <FileText size={12} /> Paste text instead
                </button>
              )}
            </div>
          </div>
        ) : source.status === "pending" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12.5px] text-gold">Not processed yet.</p>
            <button type="button" className="px-btn h-7 text-[12px]" onClick={() => processSource(id)}>
              <Play size={12} /> Process
            </button>
          </div>
        ) : (
          <div>
            <p className="flex items-center gap-2 text-[12.5px] text-[#7fe6b5]">
              <Check size={13} /> Processed · {concepts.length} concept{concepts.length === 1 ? "" : "s"}
              {source.truncated && <span className="text-ink-3">· long article, first part analysed</span>}
            </p>
            {source.paywallHint && <p className="mt-1 text-[11.5px] text-gold">The page signals paywalled content — the extracted text may be partial.</p>}
            {source.textOrigin === "abstract" && (
              <p className="mt-1 text-[11.5px] leading-snug text-gold">
                Only the abstract{source.abstractFrom ? ` supplied by ${PROVIDER_LABELS[source.abstractFrom]}` : ""} was analysed — the full page was not read{source.accessError ? ` (${source.accessError.message.replace(/\.$/, "")})` : ""}.
                {!pasting && PASTE_FALLBACK.has(source.accessError?.code ?? "network") && (
                  <button type="button" className="ml-1 underline underline-offset-2 hover:text-ink" onClick={() => setPasting(true)}>
                    Paste the full text
                  </button>
                )}
              </p>
            )}
            {source.analysis === "local" && <ApproximateNotice />}
          </div>
        )}
        {pasting && <PasteForSource sourceId={id} onDone={() => setPasting(false)} />}
      </Section>

      {(source.signals?.length || source.providers?.length || source.citedBy !== undefined) && (
        <Section title="Why this source">
          {(source.signals?.length ?? 0) > 0 && (
            <ul className="flex flex-wrap gap-1">
              {source.signals!.map((s) => (
                <li key={s} className="border border-line px-1.5 py-px text-[11px] text-ink-2">
                  {s}
                </li>
              ))}
            </ul>
          )}
          {source.providers?.length ? <p className="mt-2 text-[11.5px] text-ink-3">Found by {source.providers.map((p) => PROVIDER_LABELS[p]).join(", ")}{source.query ? ` for “${source.query}”` : ""}.</p> : null}
          <p className="mt-1 text-[11px] text-ink-3">Labels are heuristics from the address and the index that found it — a starting point for judging the source, not a verdict.</p>
        </Section>
      )}

      {source.summary && (
        <Section title={source.summaryKind === "model" ? "Summary · written by a model" : source.textOrigin === "abstract" ? "Summary · quoted from the abstract" : "Summary · quoted sentences"}>
          {source.summaryKind === "model" ? <p className="text-[13px] leading-relaxed text-ink-2">{source.summary}</p> : <Quote>{source.summary}</Quote>}
          {source.summaryKind !== "model" && <p className="mt-1.5 text-[11px] text-ink-3">An extractive summary: these sentences appear verbatim in the {source.textOrigin === "abstract" ? "abstract" : "article"}.</p>}
        </Section>
      )}

      {source.abstract && source.textOrigin !== "abstract" && (
        <Section title={`Abstract${source.abstractFrom ? ` · from ${PROVIDER_LABELS[source.abstractFrom]}` : ""}`}>
          <p className="line-clamp-[12] text-[12.5px] leading-relaxed text-ink-2">{source.abstract}</p>
        </Section>
      )}

      {source.snippet && (
        <Section title="Search snippet">
          <p className="text-[12.5px] leading-relaxed text-ink-3">{source.snippet}</p>
          <p className="mt-1 text-[11px] text-ink-3">Returned by the search provider{source.query ? ` for “${source.query}”` : ""} — not article content.</p>
        </Section>
      )}

      {(source.keyPassages?.length ?? 0) > 0 && (
        <Section title="Key arguments · quoted">
          <div className="flex flex-col gap-2">
            {source.keyPassages!.map((p, i) => (
              <Quote key={i}>{p}</Quote>
            ))}
          </div>
        </Section>
      )}

      <Section title={`Concepts from this source · ${concepts.length}`}>
        {concepts.length === 0 ? (
          <p className="text-[12px] text-ink-3">{source.status === "ready" ? "No concepts were found." : "Concepts appear once the source is processed."}</p>
        ) : (
          <ul className="flex flex-col">
            {concepts.map((n) => {
              const shared = (n.data.concept?.refs.length ?? 0) > 1;
              return (
                <li key={n.id}>
                  <button type="button" className="flex w-full items-center gap-2 py-1 text-left text-[12.5px] text-ink-2 hover:text-ink" onClick={() => revealNode(n.id)}>
                    <span className="h-1.5 w-1.5 shrink-0" style={{ background: ROLE_COLORS.concept }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{n.data.label}</span>
                    <span className="font-pixel shrink-0 text-[7px] uppercase tracking-[0.1em] text-ink-3">{shared ? `${n.data.concept?.refs.length} sources` : CONCEPT_TYPE_LABELS[n.data.concept?.type ?? "concept"]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {claims.length > 0 && (
        <Section title={`Claims on the map · ${claims.length}`}>
          <ul className="flex flex-col gap-1.5">
            {claims.map((n) => (
              <li key={n.id}>
                <button type="button" className="flex w-full items-start gap-2 text-left text-[12.5px] leading-snug text-ink-2 hover:text-ink" onClick={() => revealNode(n.id)}>
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0" style={{ background: ROLE_COLORS.claim }} aria-hidden="true" />
                  <span>{n.data.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Your notes">
        <NotesField id={id} notes={data.notes} placeholder="How reliable is this source? What is it arguing?" />
      </Section>

      <Section title="Stored content">
        <StoredText sourceId={id} />
      </Section>

      <Section title="Actions">
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="px-btn h-8 justify-start text-[12.5px]" onClick={() => processSource(id)} disabled={Boolean(stage)}>
            <RefreshCw size={13} /> Re-analyse
          </button>
          <button type="button" className="px-btn h-8 justify-start text-[12.5px]" onClick={() => processSource(id, { refetch: true })} disabled={Boolean(stage) || !source.url || source.origin === "manual"}>
            <RotateCcw size={13} /> Fetch again
          </button>
          <button type="button" className="px-btn h-8 justify-start text-[12.5px]" onClick={() => focusOn(id)}>
            <Crosshair size={13} /> Focus
          </button>
          <button type="button" className="px-btn h-8 justify-start text-[12.5px] hover:!border-[rgba(255,122,154,0.4)] hover:!text-danger" onClick={() => requestRemoveSource(id)}>
            <Trash2 size={13} /> Remove
          </button>
        </div>
      </Section>
    </div>
  );
}

// --- Claim --------------------------------------------------------------------------

export function ClaimInspector({ id, data }: { id: string; data: IdeaData }) {
  const claim = data.claim!;
  const updateClaim = useMindspace((s) => s.updateClaim);
  const sources = useMindspace(useShallow((s) => s.nodes.filter((n) => n.data.role === "source" && claim.sourceIds.includes(n.id))));
  const about = useMindspace(useShallow((s) => s.nodes.filter((n) => n.data.role === "concept" && s.edges.some((e) => e.source === id && e.target === n.id && e.data?.relation === "evidence"))));
  const sprite = useMemo(() => getRoleSprite(data), [data]);

  return (
    <div className="pb-4">
      <div className="px-4 pb-3.5 pt-4">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center">
            <PixelSprite sprite={sprite} size={30} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="px-caption mb-1.5">
              Claim · quoted from {sources.length} source{sources.length === 1 ? "" : "s"}
            </p>
            <Quote>{claim.text}</Quote>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] leading-snug text-ink-3">A sentence stating an argument, picked by keyword cues — verbatim, not paraphrased.</p>
          <button
            type="button"
            onClick={() => updateClaim(id, { review: claim.review === "accepted" ? "unreviewed" : "accepted" })}
            aria-pressed={claim.review === "accepted"}
            className={`px-btn h-7 shrink-0 text-[12px] ${claim.review === "accepted" ? "!border-[rgba(127,230,181,0.4)] text-[#7fe6b5]" : ""}`}
          >
            <Check size={12} /> {claim.review === "accepted" ? "Reviewed" : "Mark reviewed"}
          </button>
        </div>
        {claim.sourceIds.length === 0 && <p className="mt-2 border border-[rgba(245,196,81,0.3)] bg-[rgba(245,196,81,0.06)] px-2.5 py-1.5 text-[11.5px] text-ink-2">Its source was removed. It stays because you reviewed it or added notes or links.</p>}
      </div>

      <Section title={`Where it comes from · ${sources.length}`}>
        <ul className="flex flex-col gap-1.5">
          {sources.map((n) => (
            <li key={n.id} className="flex items-center gap-2">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12.5px] text-ink-2 hover:text-ink" onClick={() => revealNode(n.id)}>
                <span className="h-1.5 w-1.5 shrink-0" style={{ background: ROLE_COLORS.source }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{n.data.label}</span>
                <span className="font-pixel shrink-0 text-[7px] uppercase tracking-[0.1em] text-ink-3">{n.data.source?.domain}</span>
              </button>
              {n.data.source?.url && (
                <a href={n.data.source.canonicalUrl ?? n.data.source.url} target="_blank" rel="noopener noreferrer" className="px-icon-btn h-7 w-7 shrink-0" aria-label={`Open ${n.data.label} in a new tab`} title="Open original">
                  <ExternalLink size={12} />
                </a>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {about.length > 0 && (
        <Section title={`Evidence about · ${about.length}`}>
          <ul className="flex flex-col">
            {about.map((n) => (
              <li key={n.id}>
                <button type="button" className="flex w-full items-center gap-2 py-1 text-left text-[12.5px] text-ink-2 hover:text-ink" onClick={() => revealNode(n.id)}>
                  <span className="h-1.5 w-1.5 shrink-0" style={{ background: ROLE_COLORS.concept }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{n.data.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Your notes">
        <NotesField id={id} notes={data.notes} placeholder="Does this hold up? What would confirm or contradict it?" />
      </Section>

      <Section title="Actions">
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="px-btn h-8 justify-start text-[12.5px]" onClick={() => focusOn(id)}>
            <Crosshair size={13} /> Focus
          </button>
          <button type="button" className="px-btn h-8 justify-start text-[12.5px] hover:!text-danger" onClick={() => requestDeleteNodes([id])}>
            <Trash2 size={13} /> Remove
          </button>
        </div>
      </Section>
    </div>
  );
}

// --- Concept ------------------------------------------------------------------------

export function ConceptInspector({ id, data }: { id: string; data: IdeaData }) {
  const concept = data.concept!;
  const updateNode = useMindspace((s) => s.updateNode);
  const updateConcept = useMindspace((s) => s.updateConcept);
  const selectEdge = useMindspace((s) => s.selectEdge);
  const addChild = useMindspace((s) => s.addChild);
  const linkSourceId = useMindspace((s) => s.linkSourceId);
  const edges = useMindspace(useShallow((s) => s.edges.filter((e) => (e.source === id || e.target === id) && !isAttribution(e.data?.relation))));
  const labels = useMindspace(useShallow((s) => Object.fromEntries(s.nodes.map((n) => [n.id, n.data.label]))));
  const sources = useMindspace(useShallow((s) => s.nodes.filter((n) => n.data.role === "source" && concept.refs.some((r) => r.sourceId === n.id))));
  const [editingDescription, setEditingDescription] = useState(false);
  const sprite = useMemo(() => getRoleSprite(data), [data]);
  const byId = new Map(sources.map((n) => [n.id, n]));

  return (
    <div className="pb-4">
      <div className="px-4 pb-3.5 pt-4">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center">
            <PixelSprite sprite={sprite} size={data.kind === "planet" ? 40 : 30} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="px-caption mb-1 flex items-center gap-2">
              Concept from sources · {concept.refs.length} source{concept.refs.length === 1 ? "" : "s"}
            </p>
            <textarea
              value={data.label}
              rows={1}
              maxLength={140}
              aria-label="Concept title"
              onChange={(e) => updateNode(id, { label: e.target.value.replace(/\n/g, " ") })}
              onBlur={(e) => {
                const label = e.target.value.trim() || "Untitled concept";
                if (label !== data.label) updateNode(id, { label });
                const key = labelKey(label);
                if (key && !concept.aliases.includes(key)) updateConcept(id, { aliases: [...concept.aliases, key].slice(-12) });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
              }}
              className="-ml-1.5 w-full resize-none border border-transparent bg-transparent px-1.5 py-0.5 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink outline-none [field-sizing:content] hover:border-line focus:border-[rgba(179,156,255,0.5)] focus:bg-void/60"
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <select
            value={concept.type}
            onChange={(e) => updateConcept(id, { type: e.target.value as ConceptType })}
            aria-label="Concept type"
            className="font-pixel h-7 flex-1 border border-line bg-void px-1.5 text-[8px] uppercase tracking-[0.1em] text-ink-2 outline-none focus:border-accent"
          >
            {CONCEPT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONCEPT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => updateConcept(id, { review: concept.review === "accepted" ? "unreviewed" : "accepted" })}
            aria-pressed={concept.review === "accepted"}
            className={`px-btn h-7 text-[12px] ${concept.review === "accepted" ? "!border-[rgba(127,230,181,0.4)] text-[#7fe6b5]" : ""}`}
          >
            <Check size={12} /> {concept.review === "accepted" ? "Reviewed" : "Mark reviewed"}
          </button>
        </div>
        {concept.refs.length === 0 && (
          <p className="mt-2 border border-[rgba(245,196,81,0.3)] bg-[rgba(245,196,81,0.06)] px-2.5 py-1.5 text-[11.5px] text-ink-2">Its sources were removed. It stays because it has your notes or links.</p>
        )}
        {hasTension(concept) && (
          <p className="mt-2 flex gap-1.5 border border-[rgba(255,138,107,0.3)] bg-[rgba(255,138,107,0.06)] px-2.5 py-1.5 text-[11.5px] leading-snug text-ink-2">
            <TriangleAlert size={12} className="mt-px shrink-0 text-[#FF8A6B]" />
            Possible competing explanations: a source discusses this with contrasting or disputed language. Compare the passages below.
          </p>
        )}
      </div>

      <Section
        title="Description"
        aside={
          !editingDescription && (
            <button type="button" className="text-[11px] text-ink-3 hover:text-ink" onClick={() => setEditingDescription(true)}>
              {concept.description ? "Edit" : "Write one"}
            </button>
          )
        }
      >
        {editingDescription ? (
          <textarea
            autoFocus
            defaultValue={concept.descriptionKind === "user" ? concept.description : ""}
            rows={3}
            maxLength={600}
            placeholder="Describe this concept in your own words"
            aria-label="Your description"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value) updateConcept(id, { description: value, descriptionKind: "user" });
              setEditingDescription(false);
            }}
            className="px-input resize-y px-2.5 py-2 text-[13px] leading-relaxed"
          />
        ) : concept.description ? (
          concept.descriptionKind === "quote" ? (
            <Quote source="definition quoted from a source">{concept.description}</Quote>
          ) : (
            <p className="text-[13px] leading-relaxed text-ink-2">
              {concept.description}
              <span className="mt-1 block text-[11px] text-ink-3">{concept.descriptionKind === "model" ? "Written by a language model from the passages" : "Written by you"}</span>
            </p>
          )
        ) : (
          <p className="text-[12px] text-ink-3">No definition was found in the sources. Read the passages, or write your own.</p>
        )}
      </Section>

      <Section title={`Sources & passages · ${concept.refs.length}`}>
        <div className="flex flex-col gap-3">
          {concept.refs.map((ref) => {
            const node = byId.get(ref.sourceId);
            const s = node?.data.source;
            return (
              <div key={ref.sourceId}>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <button type="button" className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium text-ink hover:text-cyan" onClick={() => node && revealNode(node.id)}>
                    {node?.data.label ?? "Removed source"}
                  </button>
                  <span className="font-pixel shrink-0 text-[7px] uppercase tracking-[0.1em] text-ink-3">
                    {ref.mentions}× {ref.tension ? "· contrast" : ""}
                  </span>
                  {s?.url && (
                    <a href={s.canonicalUrl ?? s.url} target="_blank" rel="noopener noreferrer" className="px-icon-btn h-6 w-6 shrink-0" aria-label={`Open ${node?.data.label}`}>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  {ref.passages.length === 0 ? <p className="text-[11.5px] text-ink-3">No passage stored.</p> : ref.passages.map((p, i) => <Quote key={i}>{p}</Quote>)}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={`Links · ${edges.length}`}>
        {linkSourceId === id ? (
          <ConnectPicker sourceId={id} />
        ) : (
          <button type="button" className="px-btn mb-2 h-8 w-full justify-start text-[12.5px]" onClick={() => startConnect(id)}>
            <Link2 size={14} />
            <span className="flex-1 text-left">Connect to an idea or concept</span>
            <kbd className="px-kbd">C</kbd>
          </button>
        )}
        <ul className="flex flex-col">
          {edges.map((e) => {
            const other = e.source === id ? e.target : e.source;
            const relation = e.data?.relation ?? "related";
            return (
              <li key={e.id}>
                <button type="button" className="flex w-full items-center gap-2 py-1 text-left text-[12.5px] text-ink-2 hover:text-ink" onClick={() => selectEdge(e.id)}>
                  <span className="font-pixel w-[78px] shrink-0 truncate text-[7px] uppercase tracking-[0.08em]" style={{ color: RELATION_COLORS[relation] }}>
                    {RELATION_LABELS[relation]}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{labels[other]}</span>
                  {isUnreviewed(e) && <span className="font-pixel shrink-0 text-[7px] uppercase text-gold">?</span>}
                  {e.data?.review === "hypothesis" && <span className="font-pixel shrink-0 text-[7px] uppercase text-accent">hyp</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Your notes">
        <NotesField id={id} notes={data.notes} placeholder="Your thoughts on this concept…" />
      </Section>

      <Section title="Actions">
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="px-btn h-8 justify-start text-[12.5px]" onClick={() => addChild(id)}>
            <Plus size={14} /> Add my idea
          </button>
          <button type="button" className="px-btn h-8 justify-start text-[12.5px]" onClick={() => focusOn(id)}>
            <Crosshair size={14} /> Focus
          </button>
          <button type="button" className="col-span-2 px-btn h-8 justify-start text-[12.5px] hover:!border-[rgba(255,122,154,0.4)] hover:!text-danger" onClick={() => requestDeleteNodes([id])}>
            <Trash2 size={14} /> Delete concept
          </button>
        </div>
      </Section>
    </div>
  );
}

// --- Link ---------------------------------------------------------------------------

const REVIEWS: EdgeReview[] = ["unreviewed", "accepted", "hypothesis"];

export function ResearchEdgeInspector({ edgeId }: { edgeId: string }) {
  const edge = useMindspace((s) => s.edges.find((e) => e.id === edgeId));
  const source = useMindspace((s) => s.nodes.find((n) => n.id === edge?.source));
  const target = useMindspace((s) => s.nodes.find((n) => n.id === edge?.target));
  const evidenceSource = useMindspace((s) => s.nodes.find((n) => n.id === edge?.data?.evidence?.sourceId));
  const setRelation = useMindspace((s) => s.setRelation);
  const setReview = useMindspace((s) => s.setEdgeReview);
  const updateEdgeData = useMindspace((s) => s.updateEdgeData);
  const reverseEdge = useMindspace((s) => s.reverseEdge);
  const deleteEdge = useMindspace((s) => s.deleteEdge);
  const selectNode = useMindspace((s) => s.selectNode);
  if (!edge || !source || !target) return null;
  const relation = edge.data?.relation ?? "related";
  const attribution = isAttribution(relation);
  const review = edge.data?.review ?? "accepted";
  const passages = attribution ? (source.data.concept?.refs.find((r) => r.sourceId === target.id)?.passages ?? []) : [];

  return (
    <div className="p-4">
      <p className="px-caption mb-3">{attribution ? "Source attribution" : edge.data?.auto ? "Suggested link" : "Your link"}</p>
      <div className="flex flex-col gap-1.5 border border-line bg-white/[0.02] p-2.5">
        <button type="button" className="truncate text-left text-[13.5px] font-medium text-ink hover:text-accent" onClick={() => selectNode(source.id)}>
          {source.data.label}
        </button>
        <span className="font-pixel text-[8px] uppercase tracking-[0.14em]" style={{ color: RELATION_COLORS[relation] }}>
          ↓ {RELATION_LABELS[relation]}
        </span>
        <button type="button" className="truncate text-left text-[13.5px] font-medium text-ink hover:text-accent" onClick={() => selectNode(target.id)}>
          {target.data.label}
        </button>
      </div>

      {attribution ? (
        <>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">{RELATION_HINTS[relation]} Attribution links record where a concept came from; they are kept apart from links between ideas.</p>
          {passages.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              <p className="px-caption">Where it appears</p>
              {passages.map((p, i) => (
                <Quote key={i}>{p}</Quote>
              ))}
            </div>
          )}
          {target.data.source?.url && (
            <a href={target.data.source.canonicalUrl ?? target.data.source.url} target="_blank" rel="noopener noreferrer" className="px-btn mt-3 h-8 w-full justify-start text-[12.5px]">
              <ExternalLink size={13} /> Open the source
            </a>
          )}
        </>
      ) : (
        <>
          <p className="px-caption mb-2 mt-4">Review</p>
          <div className="flex flex-col gap-1" role="radiogroup" aria-label="Review status">
            {REVIEWS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={r === review}
                onClick={() => setReview(edge.id, r)}
                className={`border px-2.5 py-1.5 text-left transition-colors ${r === review ? "border-[rgba(179,156,255,0.4)] bg-accent/10" : "border-transparent hover:bg-white/[0.04]"}`}
              >
                <span className="block text-[12.5px] text-ink">{REVIEW_LABELS[r]}</span>
                <span className="block text-[11px] leading-snug text-ink-3">{REVIEW_HINTS[r]}</span>
              </button>
            ))}
          </div>

          {edge.data?.evidence && (
            <div className="mt-4">
              <p className="px-caption mb-1.5">Suggested by</p>
              <Quote source={evidenceSource ? <button type="button" className="underline-offset-2 hover:text-cyan hover:underline" onClick={() => revealNode(evidenceSource.id)}>{evidenceSource.data.label}</button> : "a removed source"}>{edge.data.evidence.text}</Quote>
            </div>
          )}

          <label htmlFor="edge-rationale" className="px-caption mb-1.5 mt-4 block">
            Why are these connected?
          </label>
          <textarea
            id="edge-rationale"
            value={edge.data?.rationale ?? ""}
            onChange={(e) => updateEdgeData(edge.id, { rationale: e.target.value || undefined })}
            rows={3}
            maxLength={1000}
            placeholder="Record your reasoning, or what would confirm it"
            className="px-input resize-y px-2.5 py-2 text-[12.5px] leading-relaxed"
          />

          <p className="px-caption mb-2 mt-4">Relationship</p>
          <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="Relationship">
            {RESEARCH_RELATIONS.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={r === relation}
                onClick={() => setRelation(edge.id, r)}
                className={`flex items-start gap-2.5 border px-2.5 py-1.5 text-left transition-colors ${r === relation ? "border-[rgba(179,156,255,0.4)] bg-accent/10" : "border-transparent hover:bg-white/[0.04]"}`}
              >
                <span className="mt-1 h-2 w-2 shrink-0" style={{ background: RELATION_COLORS[r] }} aria-hidden="true" />
                <span>
                  <span className="block text-[12.5px] text-ink">{RELATION_LABELS[r]}</span>
                  <span className="block text-[11px] leading-snug text-ink-3">{RELATION_HINTS[r]}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 grid grid-cols-2 gap-1.5">
        {!attribution && (
          <button type="button" className="px-btn h-8 text-[12.5px]" onClick={() => reverseEdge(edge.id)}>
            <ArrowLeftRight size={14} /> Reverse
          </button>
        )}
        <button type="button" className={`px-btn h-8 text-[12.5px] hover:!text-danger ${attribution ? "col-span-2" : ""}`} onClick={() => deleteEdge(edge.id)}>
          <Unlink size={14} /> Remove link
        </button>
      </div>
    </div>
  );
}

// --- Overview -----------------------------------------------------------------------

export function ResearchOverview() {
  const counts = useMindspace(
    useShallow((s) => ({
      ideas: s.nodes.filter((n) => !n.data.role).length,
      sources: s.nodes.filter((n) => n.data.role === "source").length,
      concepts: s.nodes.filter((n) => n.data.role === "concept").length,
      claims: s.nodes.filter((n) => n.data.role === "claim").length,
      domains: new Set(s.nodes.flatMap((n) => (n.data.role === "source" && n.data.source?.domain ? [n.data.source.domain] : []))).size,
      shared: s.nodes.filter((n) => (n.data.concept?.refs.length ?? 0) > 1).length,
      unreviewed: s.edges.filter(isUnreviewed).length,
    })),
  );
  const setFilter = useMindspace((s) => s.setResearchFilter);
  const setTab = useMindspace((s) => s.setResearchTab);
  const cells: Array<[string, number, () => void]> = [
    ["My ideas", counts.ideas, () => setFilter("ideas")],
    ["Sources", counts.sources, () => setTab("sources")],
    ["Concepts", counts.concepts, () => setFilter("concepts")],
    ["To review", counts.unreviewed, () => setFilter("unreviewed")],
  ];
  return (
    <div className="px-5 pb-6 pt-6">
      <p className="px-caption">Research galaxy</p>
      <dl className="mt-3 grid grid-cols-2 gap-px border border-line bg-line">
        {cells.map(([label, value, run]) => (
          <button key={label} type="button" onClick={run} className="bg-[#070818] p-2.5 text-left hover:bg-[#0b0d22]">
            <dt className="px-caption">{label}</dt>
            <dd className="mt-1 text-[15px] font-medium tabular-nums text-ink">{value}</dd>
          </button>
        ))}
      </dl>
      {counts.sources > 0 && (
        <p className="mt-2 text-[12px] text-ink-2">
          {counts.sources} source{counts.sources === 1 ? "" : "s"} from {counts.domains} site{counts.domains === 1 ? "" : "s"}
          {counts.claims > 0 ? ` · ${counts.claims} quoted claim${counts.claims === 1 ? "" : "s"}` : ""}.
        </p>
      )}
      {counts.shared > 0 && <p className="mt-1 text-[12px] text-ink-2">{counts.shared} concept{counts.shared === 1 ? " appears" : "s appear"} in more than one source.</p>}
      <div className="mt-5 space-y-2 text-[12px] text-ink-2">
        <p className="px-caption">Legend</p>
        <p className="flex items-center gap-2">
          <span className="h-2 w-2" style={{ background: ROLE_COLORS.idea }} /> Your ideas and question
        </p>
        <p className="flex items-center gap-2">
          <span className="h-2 w-2" style={{ background: ROLE_COLORS.concept }} /> Concepts found in sources
        </p>
        <p className="flex items-center gap-2">
          <span className="h-2 w-2" style={{ background: ROLE_COLORS.source }} /> Sources (papers, articles, docs, sites)
        </p>
        <p className="flex items-center gap-2">
          <span className="h-2 w-2" style={{ background: ROLE_COLORS.claim }} /> Claims quoted from sources
        </p>
        <p className="flex items-center gap-2">
          <span className="w-4 border-t border-dotted border-[#6FA3C7]" /> Attribution · concept or claim → source
        </p>
        <p className="flex items-center gap-2">
          <span className="w-4 border-t border-dotted border-[#E8B65A]" /> Evidence · claim → concept
        </p>
        <p className="flex items-center gap-2">
          <span className="w-4 border-t border-dashed border-[#7C8CFF]" /> Suggested link, not yet reviewed
        </p>
      </div>
      <p className="mt-5 text-[11.5px] leading-relaxed text-ink-3">Select a source to light up its concepts; select a concept to see every source and passage behind it.</p>
    </div>
  );
}
