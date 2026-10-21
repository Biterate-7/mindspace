"use client";

import { Command, Download, Keyboard, PanelLeft, Plus, Redo2, Star, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { ModeSwitch } from "@/components/app/ModeSwitch";
import { LogoMark } from "@/components/ui/PixelIcon";
import { Tooltip } from "@/components/ui/Tooltip";
import { useMindspace } from "@/lib/store";
import { openExport } from "@/lib/store/actions";

function SaveIndicator() {
  const status = useMindspace((s) => s.saveStatus);
  const config = {
    saved: { label: "Saved", color: "bg-cyan", blink: false, title: "All changes saved in this browser" },
    saving: { label: "Saving", color: "bg-accent", blink: true, title: "Saving changes…" },
    error: { label: "Not saved", color: "bg-danger", blink: false, title: "Saving failed. Your edits stay in this tab." },
    memory: { label: "Session only", color: "bg-gold", blink: false, title: "Browser storage is unavailable; maps last until this tab closes." },
  }[status];
  return (
    <span className="font-pixel flex shrink-0 items-center gap-1.5 text-[8px] uppercase tracking-[0.14em] text-ink-3" title={config.title} role="status" aria-live="polite">
      <span className={`h-1.5 w-1.5 ${config.color} ${config.blink ? "ms-blink" : ""}`} aria-hidden="true" />
      <span className="hidden sm:inline">{config.label}</span>
    </span>
  );
}

function TitleField() {
  const title = useMindspace((s) => s.current?.title ?? "");
  const renameMap = useMindspace((s) => s.renameMap);
  // null while not editing, so the field always mirrors the stored title until focused.
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const value = draft ?? title;

  const commit = () => {
    if (draft !== null && draft.trim()) renameMap(draft);
    setDraft(null);
  };

  return (
    <div className="relative min-w-0 max-w-[420px] flex-1">
      <span className="invisible block truncate whitespace-pre px-2 text-[14px] font-medium" aria-hidden="true">
        {value || " "}
      </span>
      <input
        ref={inputRef}
        value={value}
        onFocus={() => setDraft(title)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") inputRef.current?.blur();
          if (e.key === "Escape") {
            setDraft(title);
            requestAnimationFrame(() => inputRef.current?.blur());
          }
        }}
        aria-label="Map title"
        maxLength={120}
        className="absolute inset-0 w-full truncate border border-transparent bg-transparent px-2 text-[14px] font-medium text-ink outline-none transition-colors hover:border-line focus:border-[rgba(179,156,255,0.5)] focus:bg-void/60"
      />
    </div>
  );
}

export function TopBar({ compact }: { compact: boolean }) {
  const toggleSidebar = useMindspace((s) => s.toggleSidebar);
  const sidebarOpen = useMindspace((s) => s.sidebarOpen);
  const canUndo = useMindspace((s) => s.history.past.length > 0);
  const canRedo = useMindspace((s) => s.history.future.length > 0);
  const undo = useMindspace((s) => s.undo);
  const redo = useMindspace((s) => s.redo);
  const openCreate = useMindspace((s) => s.openCreate);
  const openDiscover = useMindspace((s) => s.openDiscover);
  const discovery = useMindspace((s) => s.current?.workspace === "discovery");
  const setDialog = useMindspace((s) => s.setDialog);
  const starred = useMindspace((s) => s.current?.starred ?? false);
  const currentId = useMindspace((s) => s.current?.id);
  const toggleStar = useMindspace((s) => s.toggleStar);

  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-1 border-b border-line bg-[#05060f]/92 px-2 backdrop-blur-md sm:gap-2 sm:px-3">
      <Tooltip label={sidebarOpen ? "Hide sidebar" : "Show sidebar"} shortcut="[">
        <button type="button" className="px-icon-btn" onClick={() => toggleSidebar()} aria-label="Toggle sidebar" aria-expanded={sidebarOpen}>
          <PanelLeft size={17} />
        </button>
      </Tooltip>
      <div className="flex shrink-0 items-center gap-2 pr-1 sm:pr-2">
        <LogoMark size={18} />
        <span className="font-pixel hidden text-[11px] tracking-[0.14em] text-ink xl:inline">MINDSPACE</span>
      </div>
      <ModeSwitch compact={compact} className="mr-1" />
      <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
      <TitleField />
      {currentId && (
        <Tooltip label={starred ? "Remove from saved" : "Save to sidebar"}>
          <button type="button" className="px-icon-btn hidden h-8 w-8 sm:inline-flex" onClick={() => toggleStar(currentId)} aria-pressed={starred} aria-label="Save map">
            <Star size={15} fill={starred ? "currentColor" : "none"} />
          </button>
        </Tooltip>
      )}
      <SaveIndicator />
      <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
        {!compact && (
          <>
            <Tooltip label="Undo" shortcut="Ctrl Z">
              <button type="button" className="px-icon-btn" onClick={undo} disabled={!canUndo} aria-label="Undo">
                <Undo2 size={16} />
              </button>
            </Tooltip>
            <Tooltip label="Redo" shortcut="Ctrl ⇧ Z">
              <button type="button" className="px-icon-btn" onClick={redo} disabled={!canRedo} aria-label="Redo">
                <Redo2 size={16} />
              </button>
            </Tooltip>
            <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
            <Tooltip label="Command menu" shortcut="Ctrl K">
              <button type="button" className="px-icon-btn" onClick={() => setDialog({ type: "command" })} aria-label="Open command menu">
                <Command size={16} />
              </button>
            </Tooltip>
            <Tooltip label="Keyboard shortcuts" shortcut="?">
              <button type="button" className="px-icon-btn" onClick={() => setDialog({ type: "shortcuts" })} aria-label="Show keyboard shortcuts">
                <Keyboard size={16} />
              </button>
            </Tooltip>
          </>
        )}
        <Tooltip label="Export PNG" shortcut="E">
          <button type="button" className={compact ? "px-icon-btn" : "px-btn ml-1"} onClick={openExport} aria-label="Export as PNG">
            <Download size={15} />
            {!compact && <span>Export</span>}
          </button>
        </Tooltip>
        <Tooltip label={discovery ? "New research" : "New map"} shortcut="N">
          <button type="button" className={`px-btn-primary ${compact ? "h-8 w-9 px-0" : "ml-1"}`} onClick={discovery ? openDiscover : openCreate} aria-label={discovery ? "Start new research" : "Create a new map"}>
            <Plus size={14} strokeWidth={2.5} />
            {!compact && <span>{discovery ? "New research" : "New map"}</span>}
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
