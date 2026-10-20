import { applyEdgeChanges, applyNodeChanges } from "@xyflow/react";
import type { StateCreator } from "zustand";
import type { IdeaEdge, IdeaNode } from "@/types/graph";
import { computeEmphasis, searchNodes } from "@/lib/graph/emphasis";
import { record, redo as redoHistory, sameGraph, undo as undoHistory } from "@/lib/graph/history";
import * as ops from "@/lib/graph/ops";
import { computeLayout } from "@/lib/generation/layout";
import { prefersReducedMotion } from "@/lib/utils/motion";
import type { GraphSlice, Store } from "./types";

type SetState = Parameters<StateCreator<Store>>[0];
type GetState = () => Store;

/** Edits of the same field within this window collapse into one undo step. */
const COALESCE_MS = 1200;
let lastCoalesce: { key: string; at: number } | null = null;
let dragSnapshot: ReturnType<typeof ops.toGraph> | null = null;
let relayoutFrame = 0;

function neighbourIds(edges: readonly IdeaEdge[], id: string): string[] {
  return [id, ...ops.neighborIds(edges, id)];
}

/** Recomputes everything derived from nodes/edges + interaction state. */
export function derive(state: Store): Pick<Store, "emphasis" | "searchMatches" | "selectedNodeId" | "selectedEdgeId" | "hoverId" | "focusId" | "searchIndex"> {
  const ids = new Set(state.nodes.map((n) => n.id));
  const edgeIds = new Set(state.edges.map((e) => e.id));
  const selectedNodeId = state.selectedNodeId && ids.has(state.selectedNodeId) ? state.selectedNodeId : null;
  const selectedEdgeId = state.selectedEdgeId && edgeIds.has(state.selectedEdgeId) ? state.selectedEdgeId : null;
  const hoverId = state.hoverId && ids.has(state.hoverId) ? state.hoverId : null;
  const focusId = state.focusId && ids.has(state.focusId) ? state.focusId : null;
  const searchMatches = state.searchQuery.trim() ? searchNodes(state.nodes, state.searchQuery) : null;
  const searchIndex = searchMatches && state.searchIndex < searchMatches.length ? state.searchIndex : 0;
  const emphasis = computeEmphasis({
    nodes: state.nodes,
    edges: state.edges,
    hoverId,
    selectedId: selectedNodeId,
    focusId: state.focusMode ? focusId : null,
    searchMatches,
  });
  return { emphasis, searchMatches, selectedNodeId, selectedEdgeId, hoverId, focusId, searchIndex };
}

function withSelection(nodes: IdeaNode[], ids: ReadonlySet<string>): IdeaNode[] {
  return nodes.map((n) => {
    const selected = ids.has(n.id);
    return Boolean(n.selected) === selected ? n : { ...n, selected };
  });
}

function clearEdgeSelection(edges: IdeaEdge[]): IdeaEdge[] {
  return edges.some((e) => e.selected) ? edges.map((e) => (e.selected ? { ...e, selected: false } : e)) : edges;
}

/** Applies a graph edit as one undoable step and schedules a save. */
function commit(set: SetState, get: GetState, patch: Partial<Store>, coalesceKey?: string): void {
  const state = get();
  const now = Date.now();
  const coalesced = coalesceKey !== undefined && lastCoalesce?.key === coalesceKey && now - lastCoalesce.at < COALESCE_MS;
  const history = coalesced ? state.history : record(state.history, ops.toGraph(state));
  lastCoalesce = coalesceKey ? { key: coalesceKey, at: now } : null;
  const next = { ...state, ...patch, history, version: state.version + 1 };
  set({ ...patch, history, version: next.version, ...derive(next) });
}

export const createGraphSlice: StateCreator<Store, [], [], GraphSlice> = (set, get) => ({
  nodes: [],
  edges: [],
  history: { past: [], future: [] },
  version: 0,
  selectedNodeId: null,
  selectedEdgeId: null,
  hoverId: null,
  focusMode: false,
  focusId: null,
  searchQuery: "",
  searchMatches: null,
  searchIndex: 0,
  emphasis: { nodes: {}, edges: {}, active: false },
  intro: null,
  leaving: {},
  linkSourceId: null,
  freshNodeId: null,

  onNodesChange: (changes) => {
    const state = get();
    // Removals go through deleteNodes so they are animated and undoable.
    const relevant = changes.filter((c) => c.type === "position" || c.type === "dimensions" || c.type === "select");
    if (relevant.length === 0) return;
    const nodes = applyNodeChanges(relevant, state.nodes);
    const selectionChanged = relevant.some((c) => c.type === "select");
    const keyboardMove = relevant.some((c) => c.type === "position" && c.position && !c.dragging && !dragSnapshot);
    if (keyboardMove) {
      // Arrow-key nudges (React Flow keyboard a11y) are real edits too.
      commit(set, get, { nodes }, "nudge");
      return;
    }
    if (!selectionChanged) {
      set({ nodes });
      return;
    }
    const selected = nodes.filter((n) => n.selected);
    const selectedNodeId = selected.length === 0 ? null : selected.some((n) => n.id === state.selectedNodeId) ? state.selectedNodeId : selected[selected.length - 1].id;
    const focusId = state.focusMode && selectedNodeId ? selectedNodeId : state.focusId;
    const next = { ...state, nodes, selectedNodeId, focusId };
    set({ nodes, ...derive(next) });
    if (state.focusMode && selectedNodeId && selectedNodeId !== state.focusId) {
      get().requestCamera({ type: "fit", ids: neighbourIds(state.edges, selectedNodeId), duration: 600 });
    }
  },

  onEdgesChange: (changes) => {
    const state = get();
    const relevant = changes.filter((c) => c.type === "select");
    if (relevant.length === 0) return;
    const edges = applyEdgeChanges(relevant, state.edges);
    const selected = edges.find((e) => e.selected);
    const next = { ...state, edges, selectedEdgeId: selected?.id ?? null };
    set({ edges, ...derive(next) });
  },

  beginDrag: () => {
    dragSnapshot = ops.toGraph(get());
  },

  endDrag: () => {
    const before = dragSnapshot;
    dragSnapshot = null;
    if (!before) return;
    const state = get();
    if (sameGraph(before, ops.toGraph(state))) return;
    lastCoalesce = null;
    set({ history: record(state.history, before), version: state.version + 1 });
  },

  selectNode: (id) => {
    const state = get();
    const nodes = withSelection(state.nodes, new Set(id ? [id] : []));
    const edges = clearEdgeSelection(state.edges);
    const focusId = state.focusMode && id ? id : state.focusId;
    const next = { ...state, nodes, edges, selectedNodeId: id, selectedEdgeId: null, focusId };
    set({ nodes, edges, ...derive(next) });
  },

  selectEdge: (id) => {
    const state = get();
    const nodes = withSelection(state.nodes, new Set());
    const edges = state.edges.map((e) => (Boolean(e.selected) === (e.id === id) ? e : { ...e, selected: e.id === id }));
    const next = { ...state, nodes, edges, selectedNodeId: null, selectedEdgeId: id };
    set({ nodes, edges, ...derive(next) });
  },

  setHover: (id) => {
    const state = get();
    if (state.hoverId === id) return;
    set(derive({ ...state, hoverId: id }));
  },

  addChild: (parentId) => {
    const state = get();
    const anchor = parentId ?? state.selectedNodeId ?? state.nodes.find((n) => n.data.kind === "core")?.id ?? null;
    if (!anchor) {
      get().addIdeaAt({ x: 0, y: 0 });
      return;
    }
    const change = ops.addChild(state, anchor);
    if (!change?.createdId) return;
    const nodes = withSelection(change.nodes, new Set([change.createdId]));
    commit(set, get, { nodes, edges: clearEdgeSelection(change.edges), selectedNodeId: change.createdId, selectedEdgeId: null, freshNodeId: change.createdId });
    get().requestCamera({ type: "center", id: change.createdId });
  },

  addIdeaAt: (position) => {
    const state = get();
    const change = ops.addStandalone(state, position);
    if (!change.createdId) return;
    const nodes = withSelection(change.nodes, new Set([change.createdId]));
    commit(set, get, { nodes, edges: clearEdgeSelection(change.edges), selectedNodeId: change.createdId, selectedEdgeId: null, freshNodeId: change.createdId });
  },

  connectNodes: (source, target, relation = "related") => {
    const state = get();
    const result = ops.connect(state, source, target, relation);
    if (!result.ok) {
      if (result.reason === "duplicate") get().toast("Those ideas are already connected.");
      return false;
    }
    commit(set, get, { edges: result.edges, linkSourceId: null });
    return true;
  },

  updateNode: (id, patch) => {
    const state = get();
    const node = state.nodes.find((n) => n.id === id);
    if (!node) return;
    const changed = (Object.keys(patch) as Array<keyof typeof patch>).some((k) => node.data[k] !== patch[k]);
    if (!changed) return;
    commit(set, get, { nodes: ops.updateNodeData(state.nodes, id, patch) }, `${id}:${Object.keys(patch).sort().join(",")}`);
  },

  deleteNodes: (ids) => {
    const state = get();
    const existing = ids.filter((id) => state.nodes.some((n) => n.id === id));
    if (existing.length === 0) return;
    const label = existing.length === 1 ? state.nodes.find((n) => n.id === existing[0])?.data.label ?? "idea" : `${existing.length} ideas`;
    const finish = () => {
      const current = get();
      const removed = ops.removeNodes(current, existing);
      const leaving = { ...current.leaving };
      for (const id of existing) delete leaving[id];
      commit(set, get, { ...removed, leaving, linkSourceId: null });
      get().toast(`Removed “${label}”`, { action: { label: "Undo", run: () => get().undo() } });
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    const leaving = { ...state.leaving };
    for (const id of existing) leaving[id] = true;
    set({ leaving });
    window.setTimeout(finish, 200);
  },

  deleteSelection: () => {
    const state = get();
    const selected = state.nodes.filter((n) => n.selected).map((n) => n.id);
    if (selected.length) {
      state.deleteNodes(selected);
      return;
    }
    if (state.selectedEdgeId) state.deleteEdge(state.selectedEdgeId);
  },

  deleteEdge: (id) => {
    const state = get();
    if (!state.edges.some((e) => e.id === id)) return;
    commit(set, get, { edges: ops.removeEdges(state.edges, [id]), selectedEdgeId: null });
    get().toast("Connection removed", { action: { label: "Undo", run: () => get().undo() } });
  },

  setRelation: (edgeId, relation) => {
    const state = get();
    commit(set, get, { edges: ops.setEdgeRelation(state.edges, edgeId, relation) });
  },

  reverseEdge: (edgeId) => {
    const state = get();
    commit(set, get, { edges: ops.reverseEdge(state.edges, edgeId) });
  },

  duplicateNode: (id) => {
    const state = get();
    const change = ops.duplicateNode(state, id);
    if (!change?.createdId) return;
    const nodes = withSelection(change.nodes, new Set([change.createdId]));
    commit(set, get, { nodes, edges: change.edges, selectedNodeId: change.createdId, selectedEdgeId: null });
    get().requestCamera({ type: "center", id: change.createdId });
  },

  relayout: () => {
    const state = get();
    if (state.nodes.length === 0) return;
    cancelAnimationFrame(relayoutFrame);
    const target = computeLayout(ops.toGraph(state));
    const from = new Map(state.nodes.map((n) => [n.id, { ...n.position }]));
    lastCoalesce = null;
    set({ history: record(state.history, ops.toGraph(state)) });
    const finish = () => {
      const s = get();
      set({ nodes: s.nodes.map((n) => (target[n.id] ? { ...n, position: target[n.id] } : n)), version: s.version + 1 });
      get().requestCamera({ type: "fit", duration: 700 });
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    const start = performance.now();
    const duration = 650;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      if (t >= 1) {
        finish();
        return;
      }
      set({
        nodes: get().nodes.map((n) => {
          const a = from.get(n.id);
          const b = target[n.id];
          if (!a || !b) return n;
          return { ...n, position: { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e } };
        }),
      });
      relayoutFrame = requestAnimationFrame(step);
    };
    relayoutFrame = requestAnimationFrame(step);
  },

  undo: () => {
    const state = get();
    const result = undoHistory(state.history, ops.toGraph(state));
    if (!result) {
      state.toast("Nothing to undo");
      return;
    }
    restore(set, get, result.graph, result.history);
  },

  redo: () => {
    const state = get();
    const result = redoHistory(state.history, ops.toGraph(state));
    if (!result) {
      state.toast("Nothing to redo");
      return;
    }
    restore(set, get, result.graph, result.history);
  },

  setFocusMode: (on) => {
    const state = get();
    if (on && !state.selectedNodeId) {
      state.toast("Select an idea first, then focus on it.");
      return;
    }
    const focusId = on ? state.selectedNodeId : null;
    set({ focusMode: on, ...derive({ ...state, focusMode: on, focusId }) });
    if (on && focusId) state.requestCamera({ type: "fit", ids: neighbourIds(state.edges, focusId), duration: 650 });
    else if (!on && state.focusMode) state.requestCamera({ type: "fit", duration: 650 });
  },

  setSearch: (query) => {
    const state = get();
    set({ searchQuery: query, ...derive({ ...state, searchQuery: query, searchIndex: 0 }) });
  },

  stepSearch: (direction) => {
    const state = get();
    const matches = state.searchMatches;
    if (!matches || matches.length === 0) return;
    const index = state.selectedNodeId && matches.includes(state.selectedNodeId) ? (state.searchIndex + direction + matches.length) % matches.length : direction === 1 ? 0 : matches.length - 1;
    set({ searchIndex: index });
    state.selectNode(matches[index]);
    state.requestCamera({ type: "center", id: matches[index], zoom: 1.1 });
  },

  startLink: (sourceId) => set({ linkSourceId: sourceId }),

  clearFresh: () => set({ freshNodeId: null }),
});

function restore(set: SetState, get: GetState, graph: ReturnType<typeof ops.toGraph>, history: Store["history"]): void {
  const state = get();
  const selected = new Set(state.nodes.filter((n) => n.selected).map((n) => n.id));
  const restored = ops.fromGraph(graph);
  const nodes = withSelection(restored.nodes, selected);
  lastCoalesce = null;
  const next = { ...state, nodes, edges: restored.edges, history, version: state.version + 1, leaving: {} };
  set({ nodes, edges: restored.edges, history, version: next.version, leaving: {}, ...derive(next) });
}

/** Resets per-map interaction state when a different map is loaded. */
export function resetGraphState(nodes: IdeaNode[], edges: IdeaEdge[]): Partial<Store> {
  lastCoalesce = null;
  dragSnapshot = null;
  return {
    nodes,
    edges,
    history: { past: [], future: [] },
    selectedNodeId: null,
    selectedEdgeId: null,
    hoverId: null,
    focusMode: false,
    focusId: null,
    searchQuery: "",
    searchMatches: null,
    searchIndex: 0,
    emphasis: { nodes: {}, edges: {}, active: false },
    leaving: {},
    linkSourceId: null,
    freshNodeId: null,
  };
}
