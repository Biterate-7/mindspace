import type { IdeaEdge, IdeaNode } from "@/types/graph";

/**
 * Visual emphasis for hover, selection, focus mode, search and Discovery filters,
 * precomputed into small per-id codes so each node/edge component can subscribe to a single string.
 *
 * Node code: level + flags. Levels: n normal, s softened (hover/selection elsewhere), d dimmed (search miss),
 * x filtered out (Discovery filter), f faded (outside focus).
 * Flags: h highlighted neighbourhood, m search match.
 */

export interface EmphasisInput {
  nodes: readonly IdeaNode[];
  edges: readonly IdeaEdge[];
  hoverId: string | null;
  selectedId: string | null;
  focusId: string | null;
  searchMatches: readonly string[] | null;
  /** Discovery filter: ids that stay bright; everything else is filtered back. */
  filter?: { nodes: ReadonlySet<string>; edges: ReadonlySet<string> } | null;
  /** Discovery: selecting a node lights up what it connects to (a source's concepts, a concept's sources). */
  selectionFocus?: boolean;
}

export interface Emphasis {
  nodes: Record<string, string>;
  edges: Record<string, string>;
  active: boolean;
}

export const NO_EMPHASIS: Emphasis = { nodes: {}, edges: {}, active: false };

function neighbourhood(edges: readonly IdeaEdge[], id: string): Set<string> {
  const set = new Set([id]);
  for (const e of edges) {
    if (e.source === id) set.add(e.target);
    else if (e.target === id) set.add(e.source);
  }
  return set;
}

export function computeEmphasis({ nodes, edges, hoverId, selectedId, focusId, searchMatches, filter = null, selectionFocus = false }: EmphasisInput): Emphasis {
  const selectSet = selectionFocus && selectedId ? neighbourhood(edges, selectedId) : null;
  if (!hoverId && !selectedId && !focusId && !searchMatches && !filter) return NO_EMPHASIS;
  const hoverSet = hoverId ? neighbourhood(edges, hoverId) : null;
  const focusSet = focusId ? neighbourhood(edges, focusId) : null;
  const searchSet = searchMatches ? new Set(searchMatches) : null;

  const nodeCodes: Record<string, string> = {};
  for (const node of nodes) {
    let level = "n";
    if (focusSet && !focusSet.has(node.id)) level = "f";
    else if (filter && !filter.nodes.has(node.id) && !selectSet?.has(node.id)) level = "x";
    else if (searchSet && !searchSet.has(node.id)) level = "d";
    else if (hoverSet && !hoverSet.has(node.id)) level = "s";
    else if (!hoverSet && selectSet && !selectSet.has(node.id)) level = "s";
    const lit = hoverSet ? hoverSet.has(node.id) : Boolean(selectSet?.has(node.id));
    const flags = `${lit ? "h" : ""}${searchSet?.has(node.id) ? "m" : ""}`;
    const code = level + flags;
    if (code !== "n") nodeCodes[node.id] = code;
  }

  const edgeCodes: Record<string, string> = {};
  for (const edge of edges) {
    const touchesHover = hoverId !== null && (edge.source === hoverId || edge.target === hoverId);
    const touchesSelected = selectedId !== null && (edge.source === selectedId || edge.target === selectedId);
    const touchesFocus = focusId !== null && (edge.source === focusId || edge.target === focusId);
    let level = "n";
    if (focusId && !touchesFocus) level = "f";
    else if (filter && !filter.edges.has(edge.id) && !(selectSet && touchesSelected)) level = "x";
    else if (searchSet && !(searchSet.has(edge.source) && searchSet.has(edge.target))) level = "d";
    else if (hoverId && !touchesHover) level = "s";
    else if (!hoverId && selectSet && !touchesSelected) level = "s";
    const code = level + (touchesHover || touchesSelected ? "h" : "");
    if (code !== "n") edgeCodes[edge.id] = code;
  }
  return { nodes: nodeCodes, edges: edgeCodes, active: true };
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Everything searchable about a node beyond its title: notes, and for Discovery nodes their source details. */
function detailText(node: IdeaNode): string {
  const { notes, source, concept } = node.data;
  const parts = [notes];
  if (source) parts.push(source.domain, source.siteName ?? "", source.summary ?? "", source.description ?? "", source.snippet ?? "", source.byline ?? "");
  if (concept) parts.push(concept.description ?? "", concept.type);
  return parts.join(" \n ");
}

/** Ids of nodes whose title or details contain every word of the query; title matches rank first. */
export function searchNodes(nodes: readonly IdeaNode[], query: string): string[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const scored: Array<{ id: string; score: number }> = [];
  for (const node of nodes) {
    const label = fold(node.data.label);
    const details = fold(detailText(node));
    if (!terms.every((t) => label.includes(t) || details.includes(t))) continue;
    const titleHits = terms.filter((t) => label.includes(t)).length;
    const prefix = label.startsWith(terms[0]) ? 1 : 0;
    scored.push({ id: node.id, score: titleHits * 2 + prefix });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.id);
}
