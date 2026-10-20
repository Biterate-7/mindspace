"use client";

import { useMindspace } from "./index";

/**
 * Cross-cutting UI flows shared by menus, toolbars, the command palette and shortcuts,
 * so every entry point behaves identically (including safeguards and confirmations).
 */

export function requestDeleteNodes(ids: string[]): void {
  const state = useMindspace.getState();
  if (ids.length === 0) return;
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
