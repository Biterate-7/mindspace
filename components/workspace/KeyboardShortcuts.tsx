"use client";

import { useReactFlow } from "@xyflow/react";
import { useEffect } from "react";
import { isTypingTarget } from "@/lib/shortcuts/keymap";
import { useMindspace } from "@/lib/store";
import { openExport, requestDeleteSelection, requestRename, startConnect } from "@/lib/store/actions";

/** Global keyboard model. Ignores key presses aimed at text fields and while dialogs are open. */
export function KeyboardShortcuts() {
  const flow = useReactFlow();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = useMindspace.getState();
      if (state.view !== "workspace" || state.createOpen || state.discoverOpen) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;

      // Command palette works everywhere, including inside fields.
      if (mod && key.toLowerCase() === "k") {
        event.preventDefault();
        state.setDialog(state.dialog?.type === "command" ? null : { type: "command" });
        return;
      }
      if (state.dialog) return;
      if (isTypingTarget(event.target)) return;
      if (event.altKey) return;

      if (mod) {
        const lower = key.toLowerCase();
        if (lower === "z") {
          event.preventDefault();
          if (event.shiftKey) state.redo();
          else state.undo();
        } else if (lower === "y") {
          event.preventDefault();
          state.redo();
        } else if (lower === "d" && state.selectedNodeId) {
          event.preventDefault();
          state.duplicateNode(state.selectedNodeId);
        }
        return;
      }

      switch (key) {
        case "Escape":
          if (state.linkSourceId) state.startLink(null);
          else if (state.focusMode) state.setFocusMode(false);
          else if (state.searchQuery) state.setSearch("");
          else if (state.selectedNodeId || state.selectedEdgeId) state.selectNode(null);
          else return;
          break;
        case "Delete":
        case "Backspace":
          if (!state.selectedNodeId && !state.selectedEdgeId) return;
          requestDeleteSelection();
          break;
        case "n":
        case "N":
          if (event.shiftKey) return;
          if (state.current?.workspace === "discovery") state.openDiscover();
          else state.openCreate();
          break;
        case "f":
          void flow.fitView({ padding: 0.16, duration: 500, maxZoom: 1.15 });
          break;
        case "F":
          state.setFocusMode(!state.focusMode);
          break;
        case "+":
        case "=":
          void flow.zoomIn({ duration: 200 });
          break;
        case "-":
        case "_":
          void flow.zoomOut({ duration: 200 });
          break;
        case "0":
          void flow.zoomTo(1, { duration: 250 });
          break;
        case "/":
          document.getElementById("ms-search")?.focus();
          break;
        case "?":
          state.setDialog({ type: "shortcuts" });
          break;
        case "a":
        case "A":
          state.addChild();
          break;
        case "c":
        case "C":
          if (!state.selectedNodeId) {
            state.toast("Select an idea to connect from.");
            return;
          }
          startConnect(state.selectedNodeId);
          break;
        case "F2":
          if (!state.selectedNodeId) return;
          requestRename(state.selectedNodeId);
          break;
        case "r":
        case "R":
          state.relayout();
          break;
        case "m":
        case "M":
          state.toggleMinimap();
          break;
        case "e":
        case "E":
          openExport();
          break;
        case "[":
          state.toggleSidebar();
          break;
        case "]":
          state.toggleInspector();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [flow]);

  return null;
}
