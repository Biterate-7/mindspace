"use client";

import { Crosshair, LayoutGrid, Link2, Plus } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { useMindspace } from "@/lib/store";
import { startConnect } from "@/lib/store/actions";

/** Primary editing actions, floating at the bottom centre of the canvas. */
export function CanvasToolbar({ compact = false }: { compact?: boolean }) {
  const selectedId = useMindspace((s) => s.selectedNodeId);
  const focusMode = useMindspace((s) => s.focusMode);
  const addChild = useMindspace((s) => s.addChild);
  const setFocusMode = useMindspace((s) => s.setFocusMode);
  const relayout = useMindspace((s) => s.relayout);
  const toast = useMindspace((s) => s.toast);

  return (
    <div className="px-panel px-rivets flex items-center gap-0.5 p-1" role="toolbar" aria-label="Map tools">
      <Tooltip label={selectedId ? "Add child idea" : "Add idea"} shortcut="A" side="top">
        <button type="button" className="px-btn h-8 border-transparent bg-transparent px-2.5" onClick={() => addChild()}>
          <Plus size={15} />
          {!compact && <span>Add idea</span>}
        </button>
      </Tooltip>
      <Tooltip label="Connect selected idea" shortcut="C" side="top">
        <button
          type="button"
          className="px-icon-btn h-8 w-8"
          onClick={() => (selectedId ? startConnect(selectedId) : toast("Select an idea, then connect it — or drag from its corner port."))}
          aria-label="Connect selected idea to another"
        >
          <Link2 size={15} />
        </button>
      </Tooltip>
      <Tooltip label={focusMode ? "Exit focus mode" : "Focus on selection"} shortcut="⇧F" side="top">
        <button type="button" className="px-icon-btn h-8 w-8" onClick={() => setFocusMode(!focusMode)} aria-pressed={focusMode} aria-label="Toggle focus mode">
          <Crosshair size={15} />
        </button>
      </Tooltip>
      <Tooltip label="Reorganize layout" shortcut="R" side="top">
        <button type="button" className="px-icon-btn h-8 w-8" onClick={relayout} aria-label="Reorganize layout">
          <LayoutGrid size={15} />
        </button>
      </Tooltip>
    </div>
  );
}
