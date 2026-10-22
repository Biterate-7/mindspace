"use client";

import { ArrowLeftRight, PanelRightClose, Trash2, Unlink } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { RELATIONS } from "@/types/graph";
import { ClaimInspector, ConceptInspector, ResearchEdgeInspector, ResearchOverview, SourceInspector } from "@/components/discovery/Inspectors";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { RELATION_HINTS } from "@/lib/discovery/vocabulary";
import { RELATION_LABELS } from "@/lib/generation/relations";
import { RELATION_COLORS } from "@/lib/space/palette";
import { useMindspace } from "@/lib/store";
import { requestDeleteNodes } from "@/lib/store/actions";
import { NodeInspector } from "./NodeInspector";

function EdgeInspector({ edgeId }: { edgeId: string }) {
  const edge = useMindspace((s) => s.edges.find((e) => e.id === edgeId));
  const source = useMindspace((s) => s.nodes.find((n) => n.id === edge?.source));
  const target = useMindspace((s) => s.nodes.find((n) => n.id === edge?.target));
  const setRelation = useMindspace((s) => s.setRelation);
  const reverseEdge = useMindspace((s) => s.reverseEdge);
  const deleteEdge = useMindspace((s) => s.deleteEdge);
  const selectNode = useMindspace((s) => s.selectNode);
  if (!edge || !source || !target) return null;
  const relation = edge.data?.relation ?? "related";

  return (
    <div className="p-4">
      <p className="px-caption mb-3">Connection</p>
      <div className="flex flex-col gap-1.5 border border-line bg-white/[0.02] p-2.5">
        <button type="button" className="truncate text-left text-[13.5px] font-medium text-ink hover:text-accent" onClick={() => selectNode(source.id)}>
          {source.data.label}
        </button>
        <span className="font-pixel text-[8px] uppercase tracking-[0.14em]" style={{ color: RELATION_COLORS[relation] }}>
          ↓ {RELATION_LABELS[relation]}
        </span>
        <button type="button" className="truncate text-left text-[13.5px] font-medium text-ink hover:text-accent" onClick={() => selectNode(target.id)}>
          {target.data.label}
        </button>
      </div>
      <p className="px-caption mb-2 mt-4">Relationship</p>
      <div className="flex flex-col gap-1" role="radiogroup" aria-label="Relationship">
        {RELATIONS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={r === relation}
            onClick={() => setRelation(edge.id, r)}
            className={`flex items-start gap-2.5 border px-2.5 py-2 text-left transition-colors ${
              r === relation ? "border-[rgba(179,156,255,0.4)] bg-accent/10" : "border-transparent hover:bg-white/[0.04]"
            }`}
          >
            <span className="mt-1 h-2 w-2 shrink-0" style={{ background: RELATION_COLORS[r] }} aria-hidden="true" />
            <span>
              <span className="block text-[13px] text-ink">{RELATION_LABELS[r]}</span>
              <span className="block text-[11.5px] leading-snug text-ink-3">{RELATION_HINTS[r]}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] leading-snug text-ink-3">Suggested links come from local heuristics, not verified facts. Adjust them freely.</p>
      <div className="mt-4 grid grid-cols-2 gap-1.5">
        <button type="button" className="px-btn h-8 text-[12.5px]" onClick={() => reverseEdge(edge.id)}>
          <ArrowLeftRight size={14} /> Reverse
        </button>
        <button type="button" className="px-btn h-8 text-[12.5px] hover:!text-danger" onClick={() => deleteEdge(edge.id)}>
          <Unlink size={14} /> Remove
        </button>
      </div>
    </div>
  );
}

function MultiInspector({ ids }: { ids: string[] }) {
  const selectNode = useMindspace((s) => s.selectNode);
  const labels = useMindspace(useShallow((s) => s.nodes.filter((n) => n.selected).map((n) => n.data.label)));
  return (
    <div className="p-4">
      <p className="px-caption mb-2">Selection</p>
      <p className="text-[15px] font-semibold text-ink">{ids.length} ideas selected</p>
      <ul className="mt-3 max-h-56 overflow-y-auto">
        {labels.map((label, i) => (
          <li key={ids[i] ?? i} className="truncate py-0.5 text-[12.5px] text-ink-2">
            {label}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-ink-3">Drag any of them to move the group together.</p>
      <div className="mt-4 grid grid-cols-2 gap-1.5">
        <button type="button" className="px-btn h-8 text-[12.5px]" onClick={() => selectNode(null)}>
          Clear
        </button>
        <button type="button" className="px-btn h-8 text-[12.5px] hover:!text-danger" onClick={() => requestDeleteNodes(ids)}>
          <Trash2 size={14} /> Delete all
        </button>
      </div>
    </div>
  );
}

function EmptyInspector() {
  const current = useMindspace((s) => s.current);
  const nodeCount = useMindspace((s) => s.nodes.length);
  const edgeCount = useMindspace((s) => s.edges.length);
  const sourceLabel = current?.source.mode === "text" ? "pasted text" : current?.source.mode === "dump" ? "a brain dump" : "a topic";
  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-10 text-center">
      <PixelIcon name="telescope" scale={3} className="text-accent/80" />
      <p className="mt-4 text-[14px] font-medium text-ink">No star selected</p>
      <p className="mt-1.5 max-w-[230px] text-[12.5px] leading-relaxed text-ink-3">Click any idea to read and edit it. Drag from a star&apos;s corner port to connect it to another.</p>
      <dl className="mt-6 grid w-full grid-cols-2 gap-px border border-line bg-line text-left">
        <div className="bg-[#070818] p-2.5">
          <dt className="px-caption">Stars</dt>
          <dd className="mt-1 text-[15px] font-medium tabular-nums text-ink">{nodeCount}</dd>
        </div>
        <div className="bg-[#070818] p-2.5">
          <dt className="px-caption">Links</dt>
          <dd className="mt-1 text-[15px] font-medium tabular-nums text-ink">{edgeCount}</dd>
        </div>
      </dl>
      {current && <p className="mt-3 text-[11.5px] leading-snug text-ink-3">Generated locally from {sourceLabel}. Everything here is editable.</p>}
      <ul className="mt-5 w-full space-y-1.5 text-left text-[12px] text-ink-2">
        {[
          ["A", "Add an idea"],
          ["/", "Search the map"],
          ["?", "All shortcuts"],
        ].map(([key, label]) => (
          <li key={key} className="flex items-center justify-between">
            <span>{label}</span>
            <kbd className="px-kbd">{key}</kbd>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Contextual details for the current selection: an idea, a connection, several ideas, or nothing. */
export function Inspector({ onClose, showClose = true }: { onClose: () => void; showClose?: boolean }) {
  const selectedNodeId = useMindspace((s) => s.selectedNodeId);
  const selectedEdgeId = useMindspace((s) => s.selectedEdgeId);
  // Narrow selectors: node data objects keep their identity while nodes are dragged.
  const selectedIds = useMindspace(useShallow((s) => s.nodes.filter((n) => n.selected).map((n) => n.id)));
  const data = useMindspace((s) => (selectedNodeId ? s.nodes.find((n) => n.id === selectedNodeId)?.data : undefined));
  const discovery = useMindspace((s) => s.current?.workspace === "discovery");

  return (
    <aside className="flex h-full flex-col" aria-label="Inspector">
      {showClose && (
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pl-4 pr-1.5">
          <span className="px-caption">Inspector</span>
          <button type="button" className="px-icon-btn h-8 w-8" onClick={onClose} aria-label="Hide inspector">
            <PanelRightClose size={15} />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedIds.length > 1 ? (
          <MultiInspector ids={selectedIds} />
        ) : selectedNodeId && data ? (
          data.role === "source" && data.source ? (
            <SourceInspector key={selectedNodeId} id={selectedNodeId} data={data} />
          ) : data.role === "concept" && data.concept ? (
            <ConceptInspector key={selectedNodeId} id={selectedNodeId} data={data} />
          ) : data.role === "claim" && data.claim ? (
            <ClaimInspector key={selectedNodeId} id={selectedNodeId} data={data} />
          ) : (
            <NodeInspector key={selectedNodeId} id={selectedNodeId} data={data} />
          )
        ) : selectedEdgeId ? (
          discovery ? <ResearchEdgeInspector edgeId={selectedEdgeId} /> : <EdgeInspector edgeId={selectedEdgeId} />
        ) : discovery ? (
          <ResearchOverview />
        ) : (
          <EmptyInspector />
        )}
      </div>
    </aside>
  );
}
