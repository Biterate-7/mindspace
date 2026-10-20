"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, useMemo, useState, type CSSProperties } from "react";
import type { IdeaNode as IdeaNodeType } from "@/types/graph";
import { labelStyle, spriteSize } from "@/lib/graph/geometry";
import { CATEGORY_LABELS, CATEGORY_RAMPS, CORE_RAMP } from "@/lib/space/palette";
import { getSprite } from "@/lib/space/sprites";
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

function IdeaNodeComponent({ id, data }: NodeProps<IdeaNodeType>) {
  const emphasis = useMindspace((s) => s.emphasis.nodes[id] ?? "n");
  const introDelay = useMindspace((s) => s.intro?.nodes[id]);
  const leaving = useMindspace((s) => s.leaving[id] === true);
  // Freeze the entrance at mount so later store changes never restart the animation.
  const [entrance] = useState(() => (introDelay !== undefined ? { className: "ms-appear", delay: introDelay } : { className: "ms-new", delay: 0 }));

  const { kind, category, seed, label } = data;
  const sprite = useMemo(() => getSprite(kind, category, seed), [kind, category, seed]);
  const size = spriteSize(kind);
  const ramp = kind === "core" ? CORE_RAMP : CATEGORY_RAMPS[category];
  const style = labelStyle(kind);
  const moon = kind === "planet" && seed % 3 === 1;

  return (
    <div
      className="ms-node"
      data-kind={kind}
      data-emph={emphasis}
      style={
        {
          width: size,
          height: size,
          "--glow": withAlpha(kind === "core" ? "#B39CFF" : ramp[2], kind === "core" ? 0.42 : 0.5),
          "--label-gap": `${style.gap}px`,
          "--label-max": `${style.maxWidth}px`,
        } as CSSProperties
      }
    >
      <Handle type="target" position={Position.Top} className="ms-drop" isConnectableStart={false} aria-label={`Connect to ${label}`} />
      <div className={`absolute inset-0 ${leaving ? "ms-leaving" : entrance.className}`} style={{ "--appear-delay": `${entrance.delay}ms` } as CSSProperties}>
        <div className="ms-glow" aria-hidden="true" />
        {kind === "core" && <CoreOrbits />}
        {moon && (
          <div className="ms-orbit" style={{ "--orbit-duration": `${9 + (seed % 6)}s`, inset: "-24%" } as CSSProperties} aria-hidden="true">
            <i style={{ "--particle": ramp[1], width: 4, height: 4 } as CSSProperties} />
          </div>
        )}
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
          {kind === "planet" && (
            <span className="ms-tag" style={{ "--tag-color": ramp[1] } as CSSProperties}>
              {CATEGORY_LABELS[category]}
            </span>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="ms-port" aria-label={`Drag to connect ${label}`} title="Drag to connect" />
    </div>
  );
}

export const IdeaNode = memo(IdeaNodeComponent);
