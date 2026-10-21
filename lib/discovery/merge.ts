import type { Category, IdeaData, IdeaEdge, IdeaNode, LinkData } from "@/types/graph";
import { isAttribution } from "@/types/graph";
import type { ConceptInfo, ConceptRef, ConceptType, SourceInfo } from "@/types/research";
import type { GraphState } from "@/lib/graph/ops";
import { createEdge, hasConnection } from "@/lib/graph/ops";
import { labelKey, stem, contentWords, truncate } from "@/lib/generation/text";
import { createId, hashString } from "@/lib/utils/random";
import type { SourceAnalysis } from "./analyze/types";
import { placeNewNodes } from "./layout";

/**
 * Pure operations that fold a source's analysis into the research graph.
 *
 * - Concepts are deduplicated across sources by normalised label (word order, plurals
 *   and stop words ignored), so a concept mentioned by three articles is one node with
 *   three attribution links, not three copies.
 * - Attribution (concept → source) is stored as its own edge type, separate from the
 *   semantic links between concepts, and every concept keeps per-source passages.
 * - Every automatic semantic link starts "unreviewed" and carries the sentence that suggested it.
 */

export const MAX_CONCEPT_LABEL = 90;

const NAMED: ReadonlySet<ConceptType> = new Set(["person", "organization", "place", "event", "date", "entity"]);

export function conceptCategory(type: ConceptType): Category {
  return NAMED.has(type) ? "example" : "concept";
}

export function isSource(node: { data: IdeaData } | undefined): boolean {
  return node?.data.role === "source";
}

export function isConcept(node: { data: IdeaData } | undefined): boolean {
  return node?.data.role === "concept";
}

/** Links the user made or endorsed, which removal must respect. */
function isUserLink(edge: IdeaEdge): boolean {
  const data = edge.data;
  if (!data || isAttribution(data.relation)) return false;
  return !data.auto || data.review === "accepted" || data.review === "hypothesis" || Boolean(data.rationale);
}

function withKind(concept: ConceptInfo): IdeaData["kind"] {
  return concept.refs.length >= 2 ? "planet" : "star";
}

export interface ClearResult extends GraphState {
  removedConceptIds: string[];
  keptConceptIds: string[];
}

/**
 * Removes what a source contributed: its attribution links, its passages on concepts,
 * concepts no other source supports, and the automatic links it suggested.
 * Concepts that carry your notes or your own links are kept (without that source).
 */
export function clearSourceContribution(state: GraphState, sourceId: string, options: { removeSource: boolean; keepOrphans?: boolean }): ClearResult {
  const removedConceptIds: string[] = [];
  const keptConceptIds: string[] = [];
  let edges = state.edges.filter((e) => {
    if (isAttribution(e.data?.relation) && e.target === sourceId) return false;
    if (e.data?.auto && e.data.evidence?.sourceId === sourceId && !isUserLink(e)) return false;
    return true;
  });
  // Links you endorsed survive, but no longer quote a source that is going away.
  edges = edges.map((e) => (e.data?.evidence?.sourceId === sourceId ? { ...e, data: { ...e.data, evidence: undefined } as LinkData } : e));
  const doomed = new Set<string>(options.removeSource ? [sourceId] : []);
  const nodes: IdeaNode[] = [];
  for (const node of state.nodes) {
    const concept = node.data.concept;
    if (node.data.role !== "concept" || !concept || !concept.refs.some((r) => r.sourceId === sourceId)) {
      if (!doomed.has(node.id)) nodes.push(node);
      continue;
    }
    const refs = concept.refs.filter((r) => r.sourceId !== sourceId);
    const next: ConceptInfo = { ...concept, refs };
    if (refs.length === 0) {
      const personal = node.data.notes.trim().length > 0 || edges.some((e) => (e.source === node.id || e.target === node.id) && isUserLink(e));
      // Re-analysis keeps orphans for now so concepts found again keep their id and position.
      if (!personal && options.keepOrphans) {
        removedConceptIds.push(node.id);
      } else if (!personal) {
        doomed.add(node.id);
        removedConceptIds.push(node.id);
        continue;
      }
      keptConceptIds.push(node.id);
    }
    nodes.push({ ...node, data: { ...node.data, concept: next, kind: withKind(next) } });
  }
  edges = edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target));
  return { nodes, edges, removedConceptIds, keptConceptIds };
}

export interface RemovalPreview {
  conceptsRemoved: number;
  conceptsKept: number;
  conceptsShared: number;
  links: number;
}

export function previewSourceRemoval(state: GraphState, sourceId: string): RemovalPreview {
  const result = clearSourceContribution(state, sourceId, { removeSource: true });
  const shared = state.nodes.filter((n) => n.data.concept?.refs.some((r) => r.sourceId === sourceId) && (n.data.concept?.refs.length ?? 0) > 1).length;
  return {
    conceptsRemoved: result.removedConceptIds.length,
    conceptsKept: result.keptConceptIds.length,
    conceptsShared: shared,
    links: state.edges.length - result.edges.length,
  };
}

export function removeSource(state: GraphState, sourceId: string): ClearResult {
  return clearSourceContribution(state, sourceId, { removeSource: true });
}

export interface MergeStats {
  created: number;
  merged: number;
  links: number;
  suggestions: number;
}

export interface MergeResult extends GraphState {
  stats: MergeStats;
  newIds: string[];
}

function addRef(concept: ConceptInfo, ref: ConceptRef, key: string): ConceptInfo {
  const refs = [...concept.refs.filter((r) => r.sourceId !== ref.sourceId), ref];
  const aliases = concept.aliases.includes(key) ? concept.aliases : [...concept.aliases, key].slice(-12);
  return { ...concept, refs, aliases };
}

/**
 * Folds one source's analysis into the graph. Re-processing a source first clears
 * what it contributed before, so retries never duplicate concepts or links.
 */
export function mergeSourceAnalysis(state: GraphState, sourceId: string, analysis: SourceAnalysis, sourcePatch: Partial<SourceInfo>, question: string): MergeResult {
  const stats: MergeStats = { created: 0, merged: 0, links: 0, suggestions: 0 };
  const cleared = clearSourceContribution(state, sourceId, { removeSource: false, keepOrphans: true });
  let nodes = cleared.nodes;
  let edges = cleared.edges;
  const sourceNode = nodes.find((n) => n.id === sourceId);
  if (!sourceNode?.data.source) return { nodes: state.nodes, edges: state.edges, stats, newIds: [] };

  const source: SourceInfo = { ...sourceNode.data.source, ...sourcePatch, status: "ready", error: undefined, analysis: analysis.provider, summary: analysis.summary || undefined, summaryKind: analysis.summary ? analysis.summaryKind : undefined, keyPassages: analysis.keyPassages };
  nodes = nodes.map((n) => (n.id === sourceId ? { ...n, data: { ...n.data, label: truncate(source.title, 140), source } } : n));

  const conceptByKey = new Map<string, string>();
  const ideaByKey = new Map<string, string>();
  for (const n of nodes) {
    if (n.data.role === "concept" && n.data.concept) {
      for (const alias of n.data.concept.aliases) conceptByKey.set(alias, n.id);
      conceptByKey.set(labelKey(n.data.label), n.id);
    } else if (!n.data.role && n.data.kind !== "core") {
      ideaByKey.set(labelKey(n.data.label), n.id);
    }
  }

  const taken = new Set(nodes.map((n) => n.id));
  const idForLabel = new Map<string, string>();
  const newIds: string[] = [];
  const touched: Array<{ id: string; key: string; passage?: string; salience: number; label: string }> = [];
  const byId = new Map(nodes.map((n, i) => [n.id, i]));

  for (const item of analysis.concepts) {
    const label = truncate(item.label.replace(/\s+/g, " ").trim(), MAX_CONCEPT_LABEL);
    const key = labelKey(label);
    if (!label || !key) continue;
    const ref: ConceptRef = { sourceId, passages: item.passages.slice(0, 3), mentions: item.mentions, ...(item.tension ? { tension: true } : {}) };
    const existingId = conceptByKey.get(key);
    if (existingId && byId.has(existingId)) {
      const index = byId.get(existingId) as number;
      const node = nodes[index];
      const concept = addRef(node.data.concept as ConceptInfo, ref, key);
      if (!concept.description && item.description) Object.assign(concept, { description: item.description, descriptionKind: item.descriptionKind });
      nodes = nodes.map((n, i) => (i === index ? { ...n, data: { ...n.data, concept, kind: withKind(concept) } } : n));
      // "Extracted from" when this is the concept's only source, "mentioned in" when another source found it first.
      if (!hasConnection(edges, existingId, sourceId)) edges = [...edges, createEdge(edges, existingId, sourceId, concept.refs.length === 1 ? "extracted" : "mentions")];
      idForLabel.set(labelKey(item.label), existingId);
      touched.push({ id: existingId, key, passage: ref.passages[0], salience: item.salience, label });
      stats.merged++;
      continue;
    }
    const id = createId("c", taken);
    taken.add(id);
    const concept: ConceptInfo = {
      type: item.type,
      ...(item.description ? { description: item.description, descriptionKind: item.descriptionKind } : {}),
      refs: [ref],
      aliases: [key],
      review: "unreviewed",
    };
    const node: IdeaNode = {
      id,
      type: "idea",
      position: { ...sourceNode.position },
      data: { label, notes: "", category: conceptCategory(item.type), kind: withKind(concept), seed: hashString(`${id}:${label}`), role: "concept", concept },
    };
    nodes = [...nodes, node];
    byId.set(id, nodes.length - 1);
    conceptByKey.set(key, id);
    idForLabel.set(labelKey(item.label), id);
    newIds.push(id);
    edges = [...edges, createEdge(edges, id, sourceId, "extracted")];
    touched.push({ id, key, passage: ref.passages[0], salience: item.salience, label });
    stats.created++;
  }

  const suggest = (from: string, to: string, data: Omit<LinkData, "relation">, relation: LinkData["relation"] = "related") => {
    if (from === to || hasConnection(edges, from, to)) return false;
    edges = [...edges, createEdge(edges, from, to, relation, { review: "unreviewed", auto: true, ...data })];
    return true;
  };

  for (const rel of analysis.relations) {
    const a = idForLabel.get(labelKey(rel.from));
    const b = idForLabel.get(labelKey(rel.to));
    if (!a || !b) continue;
    if (suggest(a, b, { evidence: { sourceId, text: truncate(rel.evidence, 400) } }, rel.relation)) stats.links++;
  }

  // Your own ideas with the same name as a sourced concept get a suggested link.
  for (const t of touched) {
    const ideaId = ideaByKey.get(t.key);
    if (ideaId && t.passage && suggest(ideaId, t.id, { evidence: { sourceId, text: t.passage } })) stats.suggestions++;
  }

  // The research question gets suggested links to the most salient concepts that share its words.
  const core = nodes.find((n) => n.data.kind === "core" && !n.data.role);
  if (core && question.trim()) {
    const questionStems = new Set(contentWords(question).map(stem).filter((s) => s.length >= 4));
    const related = touched
      .filter((t) => t.passage && contentWords(t.label).map(stem).some((s) => questionStems.has(s)))
      .sort((a, b) => b.salience - a.salience)
      .slice(0, 2);
    for (const t of related) if (suggest(core.id, t.id, { evidence: { sourceId, text: t.passage as string } })) stats.suggestions++;
  }

  // Concepts this source used to support but no longer mentions go now (unless they hold your notes or links).
  const stale = new Set(cleared.removedConceptIds.filter((id) => nodes.find((n) => n.id === id)?.data.concept?.refs.length === 0));
  if (stale.size) {
    nodes = nodes.filter((n) => !stale.has(n.id));
    edges = edges.filter((e) => !stale.has(e.source) && !stale.has(e.target));
  }

  const placed = placeNewNodes(nodes, edges, new Set(newIds));
  nodes = nodes.map((n) => (placed[n.id] ? { ...n, position: placed[n.id] } : n));
  return { nodes, edges, stats, newIds };
}

/** Unreviewed automatic links, for the review filter and counters. */
export function isUnreviewed(edge: IdeaEdge): boolean {
  return Boolean(edge.data && !isAttribution(edge.data.relation) && edge.data.review === "unreviewed");
}

/** Concepts flagged as discussed with contrasting language in at least one of several sources. */
export function hasTension(concept: ConceptInfo | undefined): boolean {
  return Boolean(concept && concept.refs.length >= 1 && concept.refs.some((r) => r.tension));
}

