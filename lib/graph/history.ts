import type { Graph } from "@/types/graph";

/** Snapshot-based undo/redo. Snapshots are plain graphs without selection or measurement state. */

export interface History {
  past: Graph[];
  future: Graph[];
}

export const HISTORY_LIMIT = 120;

export function emptyHistory(): History {
  return { past: [], future: [] };
}

/** Records the state *before* an edit. Any redo branch is discarded. */
export function record(history: History, before: Graph, limit = HISTORY_LIMIT): History {
  const past = [...history.past, before];
  if (past.length > limit) past.splice(0, past.length - limit);
  return { past, future: [] };
}

export function undo(history: History, current: Graph): { history: History; graph: Graph } | null {
  if (history.past.length === 0) return null;
  const graph = history.past[history.past.length - 1];
  return { history: { past: history.past.slice(0, -1), future: [current, ...history.future] }, graph };
}

export function redo(history: History, current: Graph): { history: History; graph: Graph } | null {
  if (history.future.length === 0) return null;
  const [graph, ...future] = history.future;
  return { history: { past: [...history.past, current], future }, graph };
}

export function sameGraph(a: Graph, b: Graph): boolean {
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return false;
  for (let i = 0; i < a.nodes.length; i++) {
    const x = a.nodes[i];
    const y = b.nodes[i];
    if (x.id !== y.id || x.position.x !== y.position.x || x.position.y !== y.position.y) return false;
    const dx = x.data;
    const dy = y.data;
    if (dx.label !== dy.label || dx.notes !== dy.notes || dx.category !== dy.category || dx.kind !== dy.kind) return false;
  }
  for (let i = 0; i < a.edges.length; i++) {
    const x = a.edges[i];
    const y = b.edges[i];
    if (x.id !== y.id || x.source !== y.source || x.target !== y.target || x.data.relation !== y.data.relation) return false;
  }
  return true;
}
