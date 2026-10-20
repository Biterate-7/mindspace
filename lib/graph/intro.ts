import type { NodeKind } from "@/types/graph";

type NodeLike = { id: string; data: { kind: NodeKind } };
type EdgeLike = { id: string; source: string; target: string };

/**
 * Staggered "galaxy discovery" timings: the core ignites first, primary ideas
 * appear around it, connections illuminate outward, then supporting stars fade in.
 */
export function computeIntroDelays(nodes: readonly NodeLike[], edges: readonly EdgeLike[], scale = 1): { nodes: Record<string, number>; edges: Record<string, number>; total: number } {
  const delays: Record<string, number> = {};
  const edgeDelays: Record<string, number> = {};
  if (nodes.length === 0) return { nodes: delays, edges: edgeDelays, total: 0 };
  const adjacency = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    adjacency.get(e.source)?.push(e.target);
    adjacency.get(e.target)?.push(e.source);
  }
  const root = nodes.find((n) => n.data.kind === "core") ?? nodes[0];
  delays[root.id] = 0;
  let frontier = [root.id];
  let depth = 0;
  while (frontier.length) {
    const next: string[] = [];
    let index = 0;
    for (const id of frontier) {
      let childIndex = 0;
      for (const other of adjacency.get(id) ?? []) {
        if (other in delays) continue;
        delays[other] = depth === 0 ? 300 + index * 85 : (delays[id] ?? 0) + 320 + childIndex * 55;
        childIndex++;
        index++;
        next.push(other);
      }
    }
    frontier = next;
    depth++;
  }
  let orphan = 0;
  let total = 0;
  for (const n of nodes) {
    if (!(n.id in delays)) delays[n.id] = 1300 + orphan++ * 45;
    delays[n.id] = Math.round(delays[n.id] * scale);
    total = Math.max(total, delays[n.id]);
  }
  for (const e of edges) {
    edgeDelays[e.id] = Math.max(0, Math.max(delays[e.source] ?? 0, delays[e.target] ?? 0) - Math.round(160 * scale));
  }
  return { nodes: delays, edges: edgeDelays, total };
}
