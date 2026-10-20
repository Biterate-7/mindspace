import { memo } from "react";
import type { Sprite, SpritePart } from "@/lib/space/sprites";

const PARTS: SpritePart[] = ["halo", "ray", "ring-back", "body", "ring-front", "glint"];

/** Renders a procedural sprite as crisp SVG, grouped by part so CSS can animate halos and rays. */
export const PixelSprite = memo(function PixelSprite({ sprite, size }: { sprite: Sprite; size: number }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${sprite.cells} ${sprite.cells}`} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {PARTS.map((part) => {
        const layers = sprite.layers.filter((l) => l.part === part);
        if (layers.length === 0) return null;
        return (
          <g key={part} className={`part-${part}`}>
            {layers.map((layer) => (
              <path key={`${layer.fill}-${layer.opacity}`} d={layer.d} fill={layer.fill} fillOpacity={layer.opacity === 1 ? undefined : layer.opacity} />
            ))}
          </g>
        );
      })}
    </svg>
  );
});
