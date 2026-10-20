import { expect } from "vitest";
import type { Graph } from "@/types/graph";
import { labelKey } from "@/lib/generation/text";

/** Structural invariants every generated or edited graph must satisfy. */
export function expectValidGraph(graph: Graph): void {
  const ids = graph.nodes.map((n) => n.id);
  expect(new Set(ids).size).toBe(ids.length);

  const edgeIds = graph.edges.map((e) => e.id);
  expect(new Set(edgeIds).size).toBe(edgeIds.length);

  const idSet = new Set(ids);
  const pairs = new Set<string>();
  for (const edge of graph.edges) {
    expect(idSet.has(edge.source)).toBe(true);
    expect(idSet.has(edge.target)).toBe(true);
    expect(edge.source).not.toBe(edge.target);
    const key = [edge.source, edge.target].sort().join("|");
    expect(pairs.has(key)).toBe(false);
    pairs.add(key);
  }

  const labels = graph.nodes.map((n) => labelKey(n.data.label));
  expect(new Set(labels).size).toBe(labels.length);

  for (const node of graph.nodes) {
    expect(Number.isFinite(node.position.x)).toBe(true);
    expect(Number.isFinite(node.position.y)).toBe(true);
    expect(node.data.label.trim().length).toBeGreaterThan(0);
  }
}

/** Number of nodes reachable from the first node, treating edges as undirected. */
export function reachableCount(graph: Graph): number {
  if (graph.nodes.length === 0) return 0;
  const adjacency = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) {
    adjacency.get(e.source)?.push(e.target);
    adjacency.get(e.target)?.push(e.source);
  }
  const seen = new Set([graph.nodes[0].id]);
  const stack = [graph.nodes[0].id];
  while (stack.length) {
    for (const next of adjacency.get(stack.pop() as string) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen.size;
}
