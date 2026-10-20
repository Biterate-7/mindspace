"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { ChevronUp, PanelRightOpen, Redo2, Undo2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { CanvasControls } from "@/components/graph/CanvasControls";
import { CanvasToolbar } from "@/components/graph/CanvasToolbar";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { SearchBox } from "@/components/graph/SearchBox";
import { StatusBar } from "@/components/graph/StatusBar";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { Tooltip } from "@/components/ui/Tooltip";
import { useMindspace } from "@/lib/store";
import { useMediaQuery } from "@/lib/utils/motion";
import { CommandMenu } from "./dialogs/CommandMenu";
import { ConfirmDialog } from "./dialogs/ConfirmDialog";
import { ExportDialog } from "./dialogs/ExportDialog";
import { ShortcutsDialog } from "./dialogs/ShortcutsDialog";
import { Inspector } from "./Inspector";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const PANEL_EASE = [0.2, 0.9, 0.25, 1] as const;

function EmptyCanvas() {
  const addIdeaAt = useMindspace((s) => s.addIdeaAt);
  const openCreate = useMindspace((s) => s.openCreate);
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
      <div className="px-panel px-rivets pointer-events-auto max-w-sm p-6 text-center">
        <PixelIcon name="constellation" scale={3} className="mx-auto text-accent" />
        <p className="mt-4 text-[15px] font-medium text-ink">This galaxy is empty</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">Add a central idea by hand, or generate a fresh map from a topic, text or brain dump.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" className="px-btn" onClick={() => addIdeaAt({ x: 0, y: 0 })}>
            Add central idea
          </button>
          <button type="button" className="px-btn-primary" onClick={openCreate}>
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}

function LinkBanner() {
  const linkSourceId = useMindspace((s) => s.linkSourceId);
  const label = useMindspace((s) => s.nodes.find((n) => n.id === s.linkSourceId)?.data.label);
  const startLink = useMindspace((s) => s.startLink);
  return (
    <AnimatePresence>
      {linkSourceId && label && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="px-panel pointer-events-auto flex items-center gap-3 border-[rgba(94,227,242,0.4)] py-1.5 pl-3 pr-1 text-[12.5px] text-ink"
          role="status"
        >
          <span className="h-1.5 w-1.5 bg-cyan ms-blink" aria-hidden="true" />
          <span className="max-w-[46vw] truncate">
            Click a star to connect <strong className="font-semibold">{label}</strong>
          </span>
          <button type="button" className="px-icon-btn h-7 w-7" onClick={() => startLink(null)} aria-label="Cancel connecting">
            <X size={13} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MobileInspectorSheet() {
  const selectedNodeId = useMindspace((s) => s.selectedNodeId);
  const selectedEdgeId = useMindspace((s) => s.selectedEdgeId);
  const label = useMindspace((s) => s.nodes.find((n) => n.id === s.selectedNodeId)?.data.label);
  const selectNode = useMindspace((s) => s.selectNode);
  const [expanded, setExpanded] = useState(false);
  const open = Boolean(selectedNodeId || selectedEdgeId);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="px-panel absolute inset-x-0 bottom-0 z-40 flex flex-col border-x-0 border-b-0 shadow-[0_-20px_60px_rgba(0,0,0,0.55)]"
          initial={{ y: "100%" }}
          animate={{ y: 0, height: expanded ? "72%" : 112 }}
          exit={{ y: "100%" }}
          transition={{ duration: 0.28, ease: PANEL_EASE }}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line pl-4 pr-1.5">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              <ChevronUp size={15} className={`shrink-0 text-ink-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
              <span className="truncate text-[14px] font-medium text-ink">{label ?? "Connection"}</span>
            </button>
            <button type="button" className="px-icon-btn" onClick={() => selectNode(null)} aria-label="Close inspector">
              <X size={16} />
            </button>
          </div>
          {expanded ? (
            <div className="min-h-0 flex-1">
              <Inspector onClose={() => setExpanded(false)} showClose={false} />
            </div>
          ) : (
            <button type="button" className="px-caption flex-1 text-left pl-4" onClick={() => setExpanded(true)}>
              Tap to edit title, notes and connections
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Dialogs() {
  const dialog = useMindspace((s) => s.dialog);
  const setDialog = useMindspace((s) => s.setDialog);
  const close = () => setDialog(null);
  return (
    <>
      <ShortcutsDialog open={dialog?.type === "shortcuts"} onClose={close} />
      <CommandMenu open={dialog?.type === "command"} onClose={close} />
      <ExportDialog open={dialog?.type === "export"} onClose={close} />
      <ConfirmDialog
        open={dialog?.type === "confirm"}
        title={dialog?.type === "confirm" ? dialog.title : ""}
        body={dialog?.type === "confirm" ? dialog.body : ""}
        confirmLabel={dialog?.type === "confirm" ? dialog.confirmLabel : "Confirm"}
        onConfirm={() => {
          if (dialog?.type === "confirm") dialog.run();
        }}
        onClose={close}
      />
    </>
  );
}

/** The full workspace: top bar, collapsible sidebar, galaxy canvas, contextual inspector. */
export function Workspace() {
  const desktop = useMediaQuery("(min-width: 1024px)", true);
  const tablet = useMediaQuery("(min-width: 640px)", true);
  const sidebarOpen = useMindspace((s) => s.sidebarOpen);
  const inspectorOpen = useMindspace((s) => s.inspectorOpen);
  const toggleSidebar = useMindspace((s) => s.toggleSidebar);
  const toggleInspector = useMindspace((s) => s.toggleInspector);
  const nodeCount = useMindspace((s) => s.nodes.length);
  const hasSelection = useMindspace((s) => Boolean(s.selectedNodeId || s.selectedEdgeId));
  const undo = useMindspace((s) => s.undo);
  const redo = useMindspace((s) => s.redo);
  const showInspectorRail = desktop || (tablet && hasSelection);

  return (
    <ReactFlowProvider>
      <motion.div className="flex h-dvh flex-col bg-void" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
        <TopBar compact={!tablet} />
        <div className="relative flex min-h-0 flex-1">
          {/* Sidebar: inline on desktop, slide-over below. */}
          {desktop ? (
            <motion.div
              className="relative z-20 shrink-0 overflow-hidden"
              initial={false}
              animate={{ width: sidebarOpen ? 256 : 0 }}
              transition={{ duration: 0.26, ease: PANEL_EASE }}
            >
              <div className="h-full w-64">
                <Sidebar />
              </div>
            </motion.div>
          ) : (
            <AnimatePresence>
              {sidebarOpen && (
                <>
                  <motion.button
                    type="button"
                    aria-label="Close sidebar"
                    className="absolute inset-0 z-40 bg-void/60"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => toggleSidebar(false)}
                  />
                  <motion.div
                    className="absolute inset-y-0 left-0 z-50 max-w-[85vw]"
                    initial={{ x: -280 }}
                    animate={{ x: 0 }}
                    exit={{ x: -280 }}
                    transition={{ duration: 0.26, ease: PANEL_EASE }}
                  >
                    <Sidebar onNavigate={() => toggleSidebar(false)} />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          )}

          <main className="relative min-w-0 flex-1 overflow-hidden">
            <GraphCanvas />
            {nodeCount === 0 && <EmptyCanvas />}

            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3">
              <div className="pointer-events-auto w-full max-w-[300px]">
                <SearchBox />
              </div>
              <div className="flex flex-1 justify-center">
                <LinkBanner />
              </div>
              {showInspectorRail && !inspectorOpen && (
                <Tooltip label="Show inspector" shortcut="]" side="left">
                  <button type="button" className="px-panel px-icon-btn pointer-events-auto h-9 w-9" onClick={() => toggleInspector(true)} aria-label="Show inspector">
                    <PanelRightOpen size={16} />
                  </button>
                </Tooltip>
              )}
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-3">
              <div className="hidden min-w-0 flex-1 pb-2 md:block">
                <StatusBar />
              </div>
              <div className="pointer-events-auto flex items-center gap-1.5 md:absolute md:bottom-3 md:left-1/2 md:-translate-x-1/2">
                <CanvasToolbar compact={!tablet} />
                {!tablet && (
                  <div className="px-panel flex p-0.5">
                    <button type="button" className="px-icon-btn h-8 w-8" onClick={undo} aria-label="Undo">
                      <Undo2 size={15} />
                    </button>
                    <button type="button" className="px-icon-btn h-8 w-8" onClick={redo} aria-label="Redo">
                      <Redo2 size={15} />
                    </button>
                  </div>
                )}
              </div>
              <div className="pointer-events-auto flex flex-1 justify-end">
                <CanvasControls compact={!tablet} />
              </div>
            </div>

            {!showInspectorRail && <MobileInspectorSheet />}
          </main>

          {showInspectorRail && (
            <motion.div
              className="relative z-20 shrink-0 overflow-hidden border-l border-line bg-[#05060f]/94 backdrop-blur-md"
              initial={false}
              animate={{ width: inspectorOpen ? 320 : 0 }}
              transition={{ duration: 0.26, ease: PANEL_EASE }}
            >
              <div className="h-full w-80">
                <Inspector onClose={() => toggleInspector(false)} />
              </div>
            </motion.div>
          )}
        </div>
        <KeyboardShortcuts />
        <Dialogs />
      </motion.div>
    </ReactFlowProvider>
  );
}
