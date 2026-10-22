"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, useMemo, useState, type CSSProperties } from "react";
import type { IdeaNode as IdeaNodeType } from "@/types/graph";
import { CATEGORY_LABELS as SOURCE_CATEGORY_LABELS } from "@/lib/discovery/classify";
import { STAGE_LABELS } from "@/lib/discovery/vocabulary";
import { labelStyle, spriteSize } from "@/lib/graph/geometry";
import { CATEGORY_COLORS, CATEGORY_LABELS, CATEGORY_RAMPS, CLAIM_RAMP, CONCEPT_RAMPS, CONCEPT_TYPE_LABELS, conceptRampKey, CORE_RAMP, SOURCE_RAMP } from "@/lib/space/palette";
import { getRoleSprite } from "@/lib/space/sprites";
import { useMindspace } from "@/lib/store";
import { PixelSprite } from "./PixelSprite";

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Decorative pixel particles circling the core. */
function CoreOrbits() {
  return (
    <>
      <div className="ms-orbit" style={{ "--orbit-duration": "19s" } as CSSProperties} aria-hidden="true">
        <i />
      </div>
      <div className="ms-orbit" style={{ "--orbit-duration": "31s", inset: "-46%", animationDirection: "reverse" } as CSSProperties} aria-hidden="true">
        <i style={{ "--particle": "#5EE3F2" } as CSSProperties} />
        <i style={{ top: "auto", bottom: 0, "--particle": "#F27BB5" } as CSSProperties} />
      </div>
    </>
  );
}

/** The tag line under a Discovery node: kind and domain or import stage for sources, type for concepts, provenance for claims. */
function DiscoveryTag({ id, data, discovery }: { id: string; data: IdeaNodeType["data"]; discovery: boolean }) {
  const stage = useMindspace((s) => (data.role === "source" ? s.jobs[id]?.stage : undefined));
  if (data.role === "source" && data.source) {
    const status = stage ? "working" : data.source.status;
    const kind = data.source.category ? `${SOURCE_CATEGORY_LABELS[data.source.category]} · ` : "";
    // A DOI resolver address says nothing about the publisher; show the name the index gave instead.
    const site = /doi\.org$/.test(data.source.domain) && data.source.siteName ? data.source.siteName : data.source.domain;
    const text = stage ? STAGE_LABELS[stage] : data.source.status === "failed" ? "Import failed" : data.source.status === "pending" ? "Not processed" : `${kind}${site || "Pasted text"}`;
    const color = status === "failed" ? "#FF8A9F" : status === "working" ? "#5EE3F2" : data.source.category ? CATEGORY_COLORS[data.source.category] : SOURCE_RAMP[1];
    return (
      <span className="ms-tag ms-tag-source" data-status={status} data-category={data.source.category} style={{ "--tag-color": color } as CSSProperties}>
        {status === "working" && <i className="ms-tag-pulse" aria-hidden="true" />}
        {text}
      </span>
    );
  }
  if (data.role === "concept" && data.concept) {
    const count = data.concept.refs.length;
    const ramp = CONCEPT_RAMPS[conceptRampKey(data.concept.type)];
    return (
      <span className="ms-tag" style={{ "--tag-color": ramp[1] } as CSSProperties}>
        {CONCEPT_TYPE_LABELS[data.concept.type] ?? "Concept"}
        {count > 1 && <span className="ms-tag-count"> · {count} sources</span>}
        {count === 0 && <span className="ms-tag-count"> · no source</span>}
      </span>
    );
  }
  if (data.role === "claim" && data.claim) {
    const count = data.claim.sourceIds.length;
    return (
      <span className="ms-tag" style={{ "--tag-color": CLAIM_RAMP[1] } as CSSProperties}>
        Claim
        <span className="ms-tag-count"> · {count === 0 ? "no source" : `${count} source${count === 1 ? "" : "s"}`}</span>
      </span>
    );
  }
  if (discovery && data.kind !== "core") {
    return (
      <span className="ms-tag" style={{ "--tag-color": CATEGORY_RAMPS[data.category][1] } as CSSProperties}>
        {data.kind === "planet" ? `My ${CATEGORY_LABELS[data.category].toLowerCase()}` : "My idea"}
      </span>
    );
  }
  return null;
}

function IdeaNodeComponent({ id, data }: NodeProps<IdeaNodeType>) {
  const emphasis = useMindspace((s) => s.emphasis.nodes[id] ?? "n");
  const introDelay = useMindspace((s) => s.intro?.nodes[id]);
  const leaving = useMindspace((s) => s.leaving[id] === true);
  const discovery = useMindspace((s) => s.current?.workspace === "discovery");
  const working = useMindspace((s) => data.role === "source" && Boolean(s.jobs[id]));
  // Freeze the entrance at mount so later store changes never restart the animation.
  const [entrance] = useState(() => (introDelay !== undefined ? { className: "ms-appear", delay: introDelay } : { className: "ms-new", delay: 0 }));

  const { kind, category, seed, label, role } = data;
  const conceptType = data.concept?.type;
  const sprite = useMemo(() => getRoleSprite({ kind, category, seed, role, concept: conceptType ? { type: conceptType } : undefined }), [kind, category, seed, role, conceptType]);
  const size = spriteSize(kind);
  const ramp = role === "source" ? SOURCE_RAMP : role === "concept" ? CONCEPT_RAMPS[conceptRampKey(conceptType ?? "concept")] : role === "claim" ? CLAIM_RAMP : kind === "core" ? CORE_RAMP : CATEGORY_RAMPS[category];
  const style = labelStyle(kind);
  const moon = !role && kind === "planet" && seed % 3 === 1;
  const showTag = role || (discovery && kind !== "core") || kind === "planet";

  return (
    <div
      className="ms-node"
      data-kind={kind}
      data-role={role ?? "idea"}
      data-emph={emphasis}
      data-working={working ? "true" : undefined}
      data-status={role === "source" ? data.source?.status : undefined}
      style={
        {
          width: size,
          height: size,
          "--glow": withAlpha(kind === "core" && !role ? "#B39CFF" : ramp[2], kind === "core" ? 0.42 : 0.5),
          "--label-gap": `${style.gap}px`,
          "--label-max": `${style.maxWidth}px`,
        } as CSSProperties
      }
    >
      <Handle type="target" position={Position.Top} className="ms-drop" isConnectableStart={false} aria-label={`Connect to ${label}`} />
      <div className={`absolute inset-0 ${leaving ? "ms-leaving" : entrance.className}`} style={{ "--appear-delay": `${entrance.delay}ms` } as CSSProperties}>
        <div className="ms-glow" aria-hidden="true" />
        {kind === "core" && !role && <CoreOrbits />}
        {moon && (
          <div className="ms-orbit" style={{ "--orbit-duration": `${9 + (seed % 6)}s`, inset: "-24%" } as CSSProperties} aria-hidden="true">
            <i style={{ "--particle": ramp[1], width: 4, height: 4 } as CSSProperties} />
          </div>
        )}
        {role === "source" && <div className="ms-scan ms-noexport" aria-hidden="true" />}
        <div className="ms-sprite">
          <PixelSprite sprite={sprite} size={size} />
        </div>
        <div className="ms-target ms-noexport" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <span className="ms-search-mark ms-noexport" aria-hidden="true" />
        <div className="ms-label-wrap">
          <div className="ms-label" title={label.length > 40 ? label : undefined}>
            {label}
          </div>
          {showTag &&
            (role || discovery ? (
              <DiscoveryTag id={id} data={data} discovery={discovery} />
            ) : (
              <span className="ms-tag" style={{ "--tag-color": ramp[1] } as CSSProperties}>
                {CATEGORY_LABELS[category]}
              </span>
            ))}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="ms-port" aria-label={`Drag to connect ${label}`} title="Drag to connect" />
    </div>
  );
}

export const IdeaNode = memo(IdeaNodeComponent);
