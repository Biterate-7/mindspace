import type { Category, Graph, GraphEdge, GraphNode, NodeKind, Relation } from "@/types/graph";
import { hashString } from "@/lib/utils/random";
import { labelKey, normalizeWhitespace, truncate } from "./text";

export const MAX_NODES = 45;
export const MAX_LABEL_LENGTH = 90;
export const MAX_NOTES_LENGTH = 320;

export interface NodeInput {
  label: string;
  notes?: string;
  category: Category;
  kind: NodeKind;
}

/**
 * Accumulates a graph while enforcing the engine's invariants:
 * unique ids, unique labels, no self-loops, no duplicate edges, bounded size.
 */
export class GraphBuilder {
  readonly nodes: GraphNode[] = [];
  readonly edges: GraphEdge[] = [];
  private readonly byKey = new Map<string, string>();
  private readonly edgeKeys = new Set<string>();
  private readonly limit: number;

  constructor(limit = MAX_NODES) {
    this.limit = limit;
  }

  get size(): number {
    return this.nodes.length;
  }

  get full(): boolean {
    return this.nodes.length >= this.limit;
  }

  hasLabel(label: string): boolean {
    return this.byKey.has(labelKey(label));
  }

  idForLabel(label: string): string | undefined {
    return this.byKey.get(labelKey(label));
  }

  /** Adds a node, or returns the id of an existing node with an equivalent label. Returns null when full. */
  addNode(input: NodeInput): string | null {
    const label = truncate(normalizeWhitespace(input.label), MAX_LABEL_LENGTH);
    if (!label) return null;
    const key = labelKey(label);
    const existing = this.byKey.get(key);
    if (existing) return existing;
    if (this.full) return null;
    const id = `n${this.nodes.length}`;
    this.nodes.push({
      id,
      position: { x: 0, y: 0 },
      data: {
        label,
        notes: input.notes ? truncate(input.notes, MAX_NOTES_LENGTH) : "",
        category: input.category,
        kind: input.kind,
        seed: hashString(`${label}:${this.nodes.length}`),
      },
    });
    this.byKey.set(key, id);
    return id;
  }

  hasEdge(a: string, b: string): boolean {
    return this.edgeKeys.has(pairKey(a, b));
  }

  addEdge(source: string | null, target: string | null, relation: Relation = "related"): boolean {
    if (!source || !target || source === target) return false;
    const key = pairKey(source, target);
    if (this.edgeKeys.has(key)) return false;
    this.edgeKeys.add(key);
    this.edges.push({ id: `e${this.edges.length}`, source, target, data: { relation } });
    return true;
  }

  degree(id: string): number {
    let d = 0;
    for (const e of this.edges) if (e.source === id || e.target === id) d++;
    return d;
  }

  build(): Graph {
    return { nodes: this.nodes, edges: this.edges };
  }
}

/** Order-independent key for an undirected pair. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Tier helper: questions and notes render as moons when they are leaves. */
export function kindForDepth(depth: number, category: Category): NodeKind {
  if (depth <= 0) return "core";
  if (depth === 1) return "planet";
  return category === "question" || category === "note" ? "moon" : "star";
}
