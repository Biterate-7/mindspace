import type { Category, Graph, IdeaData, IdeaEdge, IdeaNode, NodeKind, Relation } from "@/types/graph";
import { CATEGORIES, NODE_KINDS, RELATIONS } from "@/types/graph";
import { findOpenPosition } from "@/lib/generation/layout";
import { createId, hashString } from "@/lib/utils/random";

/**
 * Pure graph editing operations. Each returns new arrays and never mutates its input,
 * which keeps undo/redo snapshots trustworthy and makes the logic easy to test.
 */

export interface GraphState {
  nodes: IdeaNode[];
  edges: IdeaEdge[];
}

export interface GraphChange extends GraphState {
  /** Id of the node or edge the operation created, when there is one. */
  createdId?: string;
}

export function toFlowNode(node: { id: string; position: { x: number; y: number }; data: IdeaData }): IdeaNode {
  return { id: node.id, type: "idea", position: { ...node.position }, data: { ...node.data } };
}

export function toFlowEdge(edge: { id: string; source: string; target: string; data?: { relation: Relation } }): IdeaEdge {
  return { id: edge.id, source: edge.source, target: edge.target, type: "cosmic", data: { relation: edge.data?.relation ?? "related" } };
}

export function fromGraph(graph: Graph): GraphState {
  return { nodes: graph.nodes.map(toFlowNode), edges: graph.edges.map(toFlowEdge) };
}

/** Strips React Flow runtime fields (selection, measurements) for storage and history. */
export function toGraph(state: GraphState): Graph {
  return {
    nodes: state.nodes.map((n) => ({ id: n.id, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data: { ...n.data } })),
    edges: state.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: { relation: e.data?.relation ?? "related" } })),
  };
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function hasConnection(edges: readonly IdeaEdge[], a: string, b: string): boolean {
  const key = pairKey(a, b);
  return edges.some((e) => pairKey(e.source, e.target) === key);
}

export function neighborIds(edges: readonly IdeaEdge[], id: string): Set<string> {
  const result = new Set<string>();
  for (const e of edges) {
    if (e.source === id) result.add(e.target);
    else if (e.target === id) result.add(e.source);
  }
  return result;
}

/** Returns `base`, or `base 2`, `base 3`… so labels stay unique within a map. */
export function uniqueLabel(nodes: readonly IdeaNode[], base: string): string {
  const taken = new Set(nodes.map((n) => n.data.label.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function childKind(parent: NodeKind): NodeKind {
  return parent === "core" ? "planet" : "star";
}

function coreOf(nodes: readonly IdeaNode[]): IdeaNode | undefined {
  return nodes.find((n) => n.data.kind === "core");
}

export interface NewNodeOptions {
  label?: string;
  category?: Category;
  kind?: NodeKind;
  notes?: string;
}

export function createNode(nodes: readonly IdeaNode[], position: { x: number; y: number }, options: NewNodeOptions = {}): IdeaNode {
  const taken = new Set(nodes.map((n) => n.id));
  const id = createId("n", taken);
  const label = uniqueLabel(nodes, options.label ?? "New idea");
  return {
    id,
    type: "idea",
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    data: {
      label,
      notes: options.notes ?? "",
      category: options.category ?? "idea",
      kind: options.kind ?? "star",
      seed: hashString(`${id}:${label}`),
    },
  };
}

export function createEdge(edges: readonly IdeaEdge[], source: string, target: string, relation: Relation = "related"): IdeaEdge {
  const taken = new Set(edges.map((e) => e.id));
  return { id: createId("e", taken), source, target, type: "cosmic", data: { relation } };
}

/** Adds a child idea next to `parentId`, opening away from the core so branches keep growing outward. */
export function addChild(state: GraphState, parentId: string, options: NewNodeOptions = {}): GraphChange | null {
  const parent = state.nodes.find((n) => n.id === parentId);
  if (!parent) return null;
  const core = coreOf(state.nodes);
  const origin = core && core.id !== parent.id ? core.position : { x: parent.position.x, y: parent.position.y + 1 };
  const angle = core && core.id !== parent.id ? Math.atan2(parent.position.y - origin.y, parent.position.x - origin.x) : -Math.PI / 2 + ((state.nodes.length * 0.9) % (Math.PI * 2));
  const kind = options.kind ?? childKind(parent.data.kind);
  const label = uniqueLabel(state.nodes, options.label ?? "New idea");
  const position = findOpenPosition(state.nodes, parent.position, angle, kind, label);
  const node = createNode(state.nodes, position, { ...options, label, kind, category: options.category ?? (parent.data.kind === "core" ? "concept" : parent.data.category) });
  const edge = createEdge(state.edges, parent.id, node.id, "related");
  return { nodes: [...state.nodes, node], edges: [...state.edges, edge], createdId: node.id };
}

/** Adds an unconnected idea at `position`, nudged to the nearest free spot. */
export function addStandalone(state: GraphState, position: { x: number; y: number }, options: NewNodeOptions = {}): GraphChange {
  const kind = options.kind ?? (state.nodes.length === 0 ? "core" : "star");
  const label = uniqueLabel(state.nodes, options.label ?? (kind === "core" ? "Central idea" : "New idea"));
  const free = state.nodes.length === 0 ? position : findOpenPosition(state.nodes, position, 0, kind, label);
  const placed = state.nodes.some((n) => Math.hypot(n.position.x - position.x, n.position.y - position.y) < 60) ? free : position;
  const node = createNode(state.nodes, placed, { ...options, label, kind, category: options.category ?? (kind === "core" ? "concept" : "idea") });
  return { nodes: [...state.nodes, node], edges: state.edges, createdId: node.id };
}

export type ConnectResult = { ok: true; edges: IdeaEdge[]; createdId: string } | { ok: false; reason: "self" | "duplicate" | "missing" };

export function connect(state: GraphState, source: string, target: string, relation: Relation = "related"): ConnectResult {
  if (source === target) return { ok: false, reason: "self" };
  const ids = new Set(state.nodes.map((n) => n.id));
  if (!ids.has(source) || !ids.has(target)) return { ok: false, reason: "missing" };
  if (hasConnection(state.edges, source, target)) return { ok: false, reason: "duplicate" };
  const edge = createEdge(state.edges, source, target, relation);
  return { ok: true, edges: [...state.edges, edge], createdId: edge.id };
}

export function removeNodes(state: GraphState, ids: readonly string[]): GraphState {
  const doomed = new Set(ids);
  return {
    nodes: state.nodes.filter((n) => !doomed.has(n.id)),
    edges: state.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target)),
  };
}

export function removeEdges(edges: readonly IdeaEdge[], ids: readonly string[]): IdeaEdge[] {
  const doomed = new Set(ids);
  return edges.filter((e) => !doomed.has(e.id));
}

export function updateNodeData(nodes: readonly IdeaNode[], id: string, patch: Partial<IdeaData>): IdeaNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
}

export function setEdgeRelation(edges: readonly IdeaEdge[], id: string, relation: Relation): IdeaEdge[] {
  return edges.map((e) => (e.id === id ? { ...e, data: { relation } } : e));
}

export function reverseEdge(edges: readonly IdeaEdge[], id: string): IdeaEdge[] {
  return edges.map((e) => (e.id === id ? { ...e, source: e.target, target: e.source } : e));
}

/** Copies a node beside the original and re-attaches it to the same parents (incoming links). */
export function duplicateNode(state: GraphState, id: string): GraphChange | null {
  const original = state.nodes.find((n) => n.id === id);
  if (!original) return null;
  const kind: NodeKind = original.data.kind === "core" ? "planet" : original.data.kind;
  const label = uniqueLabel(state.nodes, `${original.data.label} copy`);
  const position = findOpenPosition(state.nodes, original.position, Math.PI / 4, kind, label);
  const copy = createNode(state.nodes, position, { label, kind, category: original.data.category, notes: original.data.notes });
  let edges = [...state.edges];
  for (const e of state.edges) {
    if (e.target === id) edges = [...edges, createEdge(edges, e.source, copy.id, e.data?.relation ?? "related")];
  }
  return { nodes: [...state.nodes, copy], edges, createdId: copy.id };
}

/**
 * Repairs graphs coming from storage or imports: drops edges pointing at missing nodes,
 * self-loops and duplicates, and coerces unknown enum values to safe defaults.
 */
export function sanitizeGraph(graph: Graph): Graph {
  const seen = new Set<string>();
  const nodes: Graph["nodes"] = [];
  for (const n of graph.nodes) {
    if (!n || typeof n.id !== "string" || seen.has(n.id) || typeof n.data !== "object" || n.data === null) continue;
    seen.add(n.id);
    const position = Number.isFinite(n.position?.x) && Number.isFinite(n.position?.y) ? { x: n.position.x, y: n.position.y } : { x: 0, y: 0 };
    nodes.push({
      id: n.id,
      position,
      data: {
        label: typeof n.data.label === "string" && n.data.label.trim() ? n.data.label : "Untitled idea",
        notes: typeof n.data.notes === "string" ? n.data.notes : "",
        category: CATEGORIES.includes(n.data.category) ? n.data.category : "idea",
        kind: NODE_KINDS.includes(n.data.kind) ? n.data.kind : "star",
        seed: Number.isFinite(n.data.seed) ? n.data.seed : hashString(n.id),
      },
    });
  }
  const pairs = new Set<string>();
  const edgeIds = new Set<string>();
  const edges: Graph["edges"] = [];
  for (const e of graph.edges) {
    if (!e || typeof e.id !== "string" || !seen.has(e.source) || !seen.has(e.target) || e.source === e.target || edgeIds.has(e.id)) continue;
    const key = pairKey(e.source, e.target);
    if (pairs.has(key)) continue;
    pairs.add(key);
    edgeIds.add(e.id);
    edges.push({ id: e.id, source: e.source, target: e.target, data: { relation: RELATIONS.includes(e.data?.relation) ? e.data.relation : "related" } });
  }
  return { nodes, edges };
}
