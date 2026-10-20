import type { NodeKind } from "@/types/graph";

/**
 * Shared sizing for celestial bodies. The node's position is the centre of its sprite;
 * the label hangs below it. Layout, collision checks and rendering all use these numbers.
 */

/** Size of one art pixel in canvas units. Every sprite sits on the same pixel grid. */
export const PIXEL = 3;

export const SPRITE_CELLS: Record<NodeKind, number> = {
  core: 33,
  planet: 21,
  star: 11,
  moon: 9,
};

export function spriteSize(kind: NodeKind): number {
  return SPRITE_CELLS[kind] * PIXEL;
}

const LABEL_STYLE: Record<NodeKind, { charWidth: number; lineHeight: number; maxWidth: number; gap: number }> = {
  core: { charWidth: 9.2, lineHeight: 21, maxWidth: 240, gap: 10 },
  planet: { charWidth: 7.4, lineHeight: 18, maxWidth: 180, gap: 8 },
  star: { charWidth: 6.8, lineHeight: 16, maxWidth: 156, gap: 6 },
  moon: { charWidth: 6.6, lineHeight: 16, maxWidth: 150, gap: 6 },
};

export function labelStyle(kind: NodeKind) {
  return LABEL_STYLE[kind];
}

export interface Footprint {
  /** Offset of the footprint's centre from the node position. */
  dy: number;
  width: number;
  height: number;
}

/** Approximate on-canvas footprint of a node including its label, used to prevent overlaps. */
export function footprint(kind: NodeKind, label: string): Footprint {
  const sprite = spriteSize(kind);
  const style = LABEL_STYLE[kind];
  const textWidth = Math.min(style.maxWidth, Math.max(24, label.length * style.charWidth)) + 14;
  const lines = Math.min(2, Math.max(1, Math.ceil((label.length * style.charWidth) / style.maxWidth)));
  const labelHeight = lines * style.lineHeight + (kind === "planet" ? 14 : 4);
  const width = Math.max(sprite, textWidth);
  const height = sprite + style.gap + labelHeight;
  return { dy: (height - sprite) / 2, width, height };
}

/** Visual radius used to trim edges so they meet the rim of a body rather than its centre. */
export function bodyRadius(kind: NodeKind): number {
  const cells = SPRITE_CELLS[kind];
  const ratio = kind === "core" ? 0.3 : kind === "planet" ? 0.36 : 0.32;
  return cells * PIXEL * ratio;
}
