"use client";

import { ArrowLeft, ArrowRight, Copy, Crosshair, Link2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { CATEGORIES, NODE_KINDS, RELATIONS, RESEARCH_RELATIONS, type IdeaData, type NodeKind, type Relation } from "@/types/graph";
import { PixelSprite } from "@/components/graph/PixelSprite";
import { RELATION_LABELS } from "@/lib/generation/relations";
import { CATEGORY_LABELS, CATEGORY_RAMPS, RELATION_COLORS } from "@/lib/space/palette";
import { getSprite } from "@/lib/space/sprites";
import { useMindspace } from "@/lib/store";
import { focusOn, requestDeleteNodes, startConnect } from "@/lib/store/actions";
import { ConnectPicker } from "./ConnectPicker";

const KIND_LABELS: Record<NodeKind, string> = { core: "Core", planet: "Planet", star: "Star", moon: "Moon" };
const KIND_HINTS: Record<NodeKind, string> = {
  core: "The central idea",
  planet: "A major branch",
  star: "A supporting idea",
  moon: "A note or question",
};

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3.5">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="px-caption">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function NodeInspector({ id, data }: { id: string; data: IdeaData }) {
  const updateNode = useMindspace((s) => s.updateNode);
  const edges = useMindspace((s) => s.edges);
  const nodeIds = useMindspace(useShallow((s) => s.nodes.map((n) => n.id)));
  const nodeData = useMindspace(useShallow((s) => s.nodes.map((n) => n.data)));
  const freshNodeId = useMindspace((s) => s.freshNodeId);
  const clearFresh = useMindspace((s) => s.clearFresh);
  const linkSourceId = useMindspace((s) => s.linkSourceId);
  const addChild = useMindspace((s) => s.addChild);
  const duplicateNode = useMindspace((s) => s.duplicateNode);
  const setRelation = useMindspace((s) => s.setRelation);
  const deleteEdge = useMindspace((s) => s.deleteEdge);
  const selectNode = useMindspace((s) => s.selectNode);
  const discovery = useMindspace((s) => s.current?.workspace === "discovery");
  const titleRef = useRef<HTMLTextAreaElement>(null);


  const ramp = data.kind === "core" ? null : CATEGORY_RAMPS[data.category];

  useEffect(() => {
    if (freshNodeId !== id) return;
    const frame = requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
      clearFresh();
    });
    return () => cancelAnimationFrame(frame);
  }, [freshNodeId, id, clearFresh]);

  const connections = useMemo(() => {
    const byId = new Map(nodeIds.map((nodeId, i) => [nodeId, nodeData[i]]));
    return edges
      .filter((e) => e.source === id || e.target === id)
      .map((e) => {
        const outgoing = e.source === id;
        const otherId = outgoing ? e.target : e.source;
        return { edge: e, outgoing, otherId, other: byId.get(otherId) };
      })
      .filter((c): c is typeof c & { other: IdeaData } => Boolean(c.other));
  }, [edges, nodeIds, nodeData, id]);

  return (
    <div className="pb-4">
      <div className="px-4 pb-3.5 pt-4">
        <p className="px-caption mb-2 flex items-center gap-2">
          <span className="h-1.5 w-1.5" style={{ background: ramp ? ramp[2] : "#FFFFFF" }} aria-hidden="true" />
          {KIND_LABELS[data.kind]} · {CATEGORY_LABELS[data.category]}
        </p>
        <label htmlFor="inspector-title" className="sr-only">
          Idea title
        </label>
        <textarea
          ref={titleRef}
          id="inspector-title"
          value={data.label}
          rows={1}
          maxLength={140}
          onChange={(e) => updateNode(id, { label: e.target.value.replace(/\n/g, " ") })}
          onBlur={(e) => {
            if (!e.target.value.trim()) updateNode(id, { label: "Untitled idea" });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          className="w-full resize-none border border-transparent bg-transparent px-1.5 py-1 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink outline-none transition-colors [field-sizing:content] hover:border-line focus:border-[rgba(179,156,255,0.5)] focus:bg-void/60"
        />
        <label htmlFor="inspector-notes" className="px-caption mb-1.5 mt-3 block">
          Notes
        </label>
        <textarea
          id="inspector-notes"
          value={data.notes}
          onChange={(e) => updateNode(id, { notes: e.target.value })}
          placeholder="Add notes, sources or open questions…"
          rows={4}
          maxLength={4000}
          className="px-input min-h-[88px] resize-y px-2.5 py-2 text-[13px] leading-relaxed text-ink-2 [field-sizing:content] focus:text-ink"
        />
      </div>

      <Section title="Category">
        <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Category">
          {CATEGORIES.map((category) => {
            const active = category === data.category;
            return (
              <button
                key={category}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updateNode(id, { category })}
                className={`flex h-8 items-center gap-2 border px-2 text-[12.5px] transition-colors ${
                  active ? "border-[rgba(179,156,255,0.4)] bg-accent/10 text-ink" : "border-transparent text-ink-2 hover:bg-white/[0.04] hover:text-ink"
                }`}
              >
                <span className="h-2.5 w-2.5 shrink-0" style={{ background: CATEGORY_RAMPS[category][2], boxShadow: `inset -1px -1px 0 ${CATEGORY_RAMPS[category][3]}` }} aria-hidden="true" />
                {CATEGORY_LABELS[category]}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Celestial body">
        <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Celestial body">
          {NODE_KINDS.map((kind) => {
            const active = kind === data.kind;
            const sprite = getSprite(kind, data.category, data.seed);
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={active}
                title={KIND_HINTS[kind]}
                onClick={() => updateNode(id, { kind })}
                className={`flex flex-col items-center gap-1 border py-2 transition-colors ${
                  active ? "border-[rgba(179,156,255,0.4)] bg-accent/10 text-ink" : "border-transparent text-ink-3 hover:bg-white/[0.04] hover:text-ink-2"
                }`}
              >
                <span className="flex h-9 w-9 items-center justify-center">
                  <PixelSprite sprite={sprite} size={kind === "core" ? 36 : kind === "planet" ? 28 : sprite.cells * 2} />
                </span>
                <span className="font-pixel text-[7px] uppercase tracking-[0.12em]">{KIND_LABELS[kind]}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title={`Connections · ${connections.length}`} aside={!linkSourceId && <span className="font-pixel text-[7px] uppercase tracking-[0.1em] text-ink-3">heuristic · editable</span>}>
        {linkSourceId === id ? (
          <ConnectPicker sourceId={id} />
        ) : (
          <button type="button" className="px-btn mb-2 h-8 w-full justify-start text-[12.5px]" onClick={() => startConnect(id)}>
            <Link2 size={14} />
            <span className="flex-1 text-left">Connect to another idea</span>
            <kbd className="px-kbd">C</kbd>
          </button>
        )}
        {connections.length === 0 ? (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">No connections yet. Drag from the star&apos;s corner port onto another idea.</p>
        ) : (
          <ul className="mt-1 flex flex-col">
            {connections.map(({ edge, outgoing, otherId, other }) => {
              const relation = edge.data?.relation ?? "related";
              return (
                <li key={edge.id} className="group flex items-center gap-1.5 py-1">
                  <span className="text-ink-3" title={outgoing ? "Outgoing" : "Incoming"} aria-label={outgoing ? "Outgoing" : "Incoming"}>
                    {outgoing ? <ArrowRight size={12} /> : <ArrowLeft size={12} />}
                  </span>
                  <select
                    value={relation}
                    onChange={(e) => setRelation(edge.id, e.target.value as Relation)}
                    className="font-pixel h-6 w-[86px] shrink-0 border border-line bg-void px-1 text-[7px] uppercase tracking-[0.08em] outline-none focus:border-accent"
                    style={{ color: RELATION_COLORS[relation] }}
                    aria-label={`Relationship with ${other.label}`}
                  >
                    {(discovery ? RESEARCH_RELATIONS : RELATIONS).map((r) => (
                      <option key={r} value={r}>
                        {RELATION_LABELS[r]}
                      </option>
                    ))}
                    {!(discovery ? RESEARCH_RELATIONS : RELATIONS).includes(relation) && <option value={relation}>{RELATION_LABELS[relation]}</option>}
                  </select>
                  <button type="button" onClick={() => selectNode(otherId)} className="min-w-0 flex-1 truncate text-left text-[12.5px] text-ink-2 hover:text-ink" title={other.label}>
                    {other.label}
                  </button>
                  <button type="button" className="px-icon-btn h-6 w-6 shrink-0 opacity-60 hover:!text-danger group-hover:opacity-100" onClick={() => deleteEdge(edge.id)} aria-label={`Remove connection to ${other.label}`}>
                    <X size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Actions">
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className="px-btn h-8 justify-start text-[12.5px]" onClick={() => addChild(id)}>
            <Plus size={14} /> Add child
          </button>
          <button type="button" className="px-btn h-8 justify-start text-[12.5px]" onClick={() => duplicateNode(id)}>
            <Copy size={14} /> Duplicate
          </button>
          <button type="button" className="px-btn h-8 justify-start text-[12.5px]" onClick={() => focusOn(id)}>
            <Crosshair size={14} /> Focus
          </button>
          <button type="button" className="px-btn h-8 justify-start text-[12.5px] hover:!border-[rgba(255,122,154,0.4)] hover:!text-danger" onClick={() => requestDeleteNodes([id])}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </Section>
    </div>
  );
}
