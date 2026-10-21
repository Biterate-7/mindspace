import type { GraphNode, IdeaEdge, IdeaNode, MindMap } from "@/types/graph";
import { isAttribution } from "@/types/graph";
import { RELATION_LABELS } from "@/lib/generation/relations";

/**
 * Structured export of a research workspace. By default it contains only metadata
 * and structure; quoted source content, your notes and stored article text are each
 * included only when explicitly chosen.
 */

export interface ResearchExportOptions {
  /** Summaries and quoted passages from sources. */
  includePassages: boolean;
  /** Your notes on ideas and concepts, plus the workspace research notes. */
  includeNotes: boolean;
  /** Full article text from the local content store, keyed by source id. */
  articleText?: Record<string, string>;
}

type NodeLike = Pick<GraphNode, "id" | "position" | "data">;
type EdgeLike = Pick<IdeaEdge, "id" | "source" | "target" | "data">;

export const EXPORT_FORMAT = "mindspace.research/v1";

export function buildResearchExport(map: Pick<MindMap, "id" | "title" | "createdAt" | "updatedAt" | "research">, nodes: readonly NodeLike[], edges: readonly EdgeLike[], options: ResearchExportOptions) {
  const { includePassages, includeNotes, articleText } = options;
  const ideas = nodes.filter((n) => !n.data.role);
  const sources = nodes.filter((n) => n.data.role === "source" && n.data.source);
  const concepts = nodes.filter((n) => n.data.role === "concept" && n.data.concept);
  return {
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    workspace: {
      id: map.id,
      title: map.title,
      question: map.research?.question ?? "",
      createdAt: new Date(map.createdAt).toISOString(),
      updatedAt: new Date(map.updatedAt).toISOString(),
      ...(includeNotes ? { notes: map.research?.notes ?? "" } : {}),
    },
    contents: { passages: includePassages, notes: includeNotes, articleText: Boolean(articleText) },
    ideas: ideas.map((n) => ({
      id: n.id,
      label: n.data.label,
      category: n.data.category,
      isQuestion: n.data.kind === "core",
      ...(includeNotes && n.data.notes ? { notes: n.data.notes } : {}),
      position: n.position,
    })),
    sources: sources.map((n) => {
      const s = n.data.source!;
      return {
        id: n.id,
        title: n.data.label,
        url: s.url || null,
        canonicalUrl: s.canonicalUrl ?? null,
        domain: s.domain,
        siteName: s.siteName ?? null,
        author: s.byline ?? null,
        publishedAt: s.publishedAt ?? null,
        publishedAtSource: s.publishedFrom ?? null,
        retrievedAt: s.retrievedAt ? new Date(s.retrievedAt).toISOString() : null,
        status: s.status,
        error: s.error ?? null,
        addedVia: s.origin,
        textOrigin: s.textOrigin ?? null,
        analysis: s.analysis ?? null,
        wordCount: s.wordCount ?? null,
        ...(includePassages ? { summary: s.summary ?? null, summaryKind: s.summaryKind ?? null, keyPassages: s.keyPassages ?? [], searchSnippet: s.snippet ?? null } : {}),
        ...(includeNotes && n.data.notes ? { notes: n.data.notes } : {}),
        ...(articleText?.[n.id] ? { articleText: articleText[n.id] } : {}),
        position: n.position,
      };
    }),
    concepts: concepts.map((n) => {
      const c = n.data.concept!;
      return {
        id: n.id,
        label: n.data.label,
        type: c.type,
        review: c.review,
        ...(c.description && (includePassages || c.descriptionKind === "user") ? { description: c.description, descriptionKind: c.descriptionKind ?? null } : {}),
        sources: c.refs.map((r) => ({ sourceId: r.sourceId, mentions: r.mentions, ...(includePassages ? { passages: r.passages } : {}), ...(r.tension ? { contrastingLanguage: true } : {}) })),
        ...(includeNotes && n.data.notes ? { notes: n.data.notes } : {}),
        position: n.position,
      };
    }),
    links: edges.map((e) => {
      const d = e.data ?? { relation: "related" as const };
      return {
        id: e.id,
        from: e.source,
        to: e.target,
        relation: d.relation,
        label: RELATION_LABELS[d.relation],
        kind: isAttribution(d.relation) ? "attribution" : "semantic",
        review: isAttribution(d.relation) ? null : (d.review ?? "accepted"),
        automatic: Boolean(d.auto),
        ...(includeNotes && d.rationale ? { rationale: d.rationale } : {}),
        ...(includePassages && d.evidence ? { evidence: d.evidence } : {}),
      };
    }),
  };
}

/** A Markdown list of sources with links, for pasting into notes or documents. */
export function sourceListMarkdown(nodes: readonly IdeaNode[]): string {
  const lines = nodes
    .filter((n) => n.data.role === "source" && n.data.source)
    .map((n) => {
      const s = n.data.source!;
      const url = s.canonicalUrl ?? s.url;
      const meta = [s.siteName ?? s.domain, s.publishedAt ? s.publishedAt.slice(0, 10) : null, s.retrievedAt ? `retrieved ${new Date(s.retrievedAt).toISOString().slice(0, 10)}` : null, s.textOrigin === "pasted" ? "text pasted manually" : null]
        .filter(Boolean)
        .join(", ");
      const title = n.data.label.replace(/([[\]])/g, "\\$1");
      return url ? `- [${title}](${url})${meta ? ` — ${meta}` : ""}` : `- ${title}${meta ? ` — ${meta}` : ""}`;
    });
  return lines.join("\n");
}

export function exportJsonFileName(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "mindspace-research"}.research.json`;
}
