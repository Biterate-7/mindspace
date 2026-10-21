"use client";

import { previewSourceRemoval } from "@/lib/discovery/merge";
import { useMindspace } from "./index";

/**
 * Cross-cutting UI flows shared by menus, toolbars, the command palette and shortcuts,
 * so every entry point behaves identically (including safeguards and confirmations).
 */

/** Removing a source also removes what only it supported, so it always asks first. */
export function requestRemoveSource(sourceId: string, then?: () => void): void {
  const state = useMindspace.getState();
  const node = state.nodes.find((n) => n.id === sourceId && n.data.role === "source");
  if (!node) return;
  const preview = previewSourceRemoval(state, sourceId);
  const parts = [
    preview.conceptsRemoved ? `${preview.conceptsRemoved} concept${preview.conceptsRemoved === 1 ? "" : "s"} found only in this source will be removed.` : "No concepts depend on this source alone.",
    preview.conceptsShared ? `${preview.conceptsShared} concept${preview.conceptsShared === 1 ? "" : "s"} shared with other sources will lose this source's passages.` : "",
    preview.conceptsKept ? `${preview.conceptsKept} concept${preview.conceptsKept === 1 ? "" : "s"} with your notes or links will be kept.` : "",
    "Its stored article text is deleted from this browser. Undo restores the graph; the text would be fetched again.",
  ].filter(Boolean);
  state.setDialog({
    type: "confirm",
    title: `Remove “${node.data.label.length > 60 ? `${node.data.label.slice(0, 58)}…` : node.data.label}”?`,
    body: parts.join(" "),
    confirmLabel: "Remove source",
    run: () => {
      useMindspace.getState().removeSourceNow(sourceId);
      then?.();
    },
  });
}

export function requestDeleteNodes(ids: string[]): void {
  const state = useMindspace.getState();
  if (ids.length === 0) return;
  const sources = ids.filter((id) => state.nodes.some((n) => n.id === id && n.data.role === "source"));
  if (sources.length > 0) {
    const rest = ids.filter((id) => !sources.includes(id));
    if (sources.length === 1) {
      requestRemoveSource(sources[0], rest.length ? () => useMindspace.getState().deleteNodes(rest) : undefined);
      return;
    }
    state.setDialog({
      type: "confirm",
      title: `Remove ${sources.length} sources${rest.length ? ` and ${rest.length} other item${rest.length === 1 ? "" : "s"}` : ""}?`,
      body: "Concepts found only in these sources are removed too; concepts with your notes or links are kept. Stored article text is deleted from this browser. Undo restores the graph.",
      confirmLabel: "Remove",
      run: () => {
        const s = useMindspace.getState();
        for (const id of sources) s.removeSourceNow(id);
        if (rest.length) useMindspace.getState().deleteNodes(rest);
      },
    });
    return;
  }
  const includesCore = state.nodes.some((n) => ids.includes(n.id) && n.data.kind === "core");
  const many = ids.length > 4;
  if ((includesCore && state.nodes.length > 1) || many) {
    const core = state.nodes.find((n) => ids.includes(n.id) && n.data.kind === "core");
    state.setDialog({
      type: "confirm",
      title: many ? `Delete ${ids.length} ideas?` : `Delete “${core?.data.label ?? "the core"}”?`,
      body: many
        ? "Their connections will be removed too. You can undo this with Ctrl/Cmd + Z."
        : "This is the central idea of your map. Its connections will be removed too. You can undo this with Ctrl/Cmd + Z.",
      confirmLabel: "Delete",
      run: () => useMindspace.getState().deleteNodes(ids),
    });
    return;
  }
  state.deleteNodes(ids);
}

export function requestDeleteSelection(): void {
  const state = useMindspace.getState();
  const selected = state.nodes.filter((n) => n.selected).map((n) => n.id);
  if (selected.length) requestDeleteNodes(selected);
  else if (state.selectedEdgeId) state.deleteEdge(state.selectedEdgeId);
}

export function requestDeleteMap(id: string): void {
  const state = useMindspace.getState();
  const meta = state.maps.find((m) => m.id === id);
  state.setDialog({
    type: "confirm",
    title: `Delete “${meta?.title ?? "this map"}”?`,
    body: "The map will be removed from this browser. You can restore it from the notification right after.",
    confirmLabel: "Delete map",
    run: () => useMindspace.getState().deleteMap(id),
  });
}

export function requestClearAll(): void {
  const state = useMindspace.getState();
  state.setDialog({
    type: "confirm",
    title: "Delete all local maps?",
    body: `This permanently removes ${state.maps.length} map${state.maps.length === 1 ? "" : "s"} and your preferences from this browser. This cannot be undone.`,
    confirmLabel: "Delete everything",
    run: () => useMindspace.getState().clearAllData(),
  });
}

export function startConnect(id: string): void {
  const state = useMindspace.getState();
  state.selectNode(id);
  state.startLink(id);
  state.toggleInspector(true);
}

export function focusOn(id: string): void {
  const state = useMindspace.getState();
  state.selectNode(id);
  useMindspace.getState().setFocusMode(true);
}

export function requestRename(id: string): void {
  const state = useMindspace.getState();
  state.selectNode(id);
  state.toggleInspector(true);
  useMindspace.setState({ freshNodeId: id });
}

export function openExport(): void {
  const state = useMindspace.getState();
  if (state.nodes.length === 0) {
    state.toast("There is nothing to export yet. Add an idea first.");
    return;
  }
  state.setDialog({ type: "export" });
}

/** Opens the Discovery launch screen (or overlay) for a new research question. */
export function startNewResearch(): void {
  useMindspace.getState().openDiscover();
}

/** Selects a node and brings it into view without changing the zoom more than needed. */
export function revealNode(id: string): void {
  const state = useMindspace.getState();
  state.selectNode(id);
  state.toggleInspector(true);
  state.requestCamera({ type: "center", id, zoom: 0.95 });
}
