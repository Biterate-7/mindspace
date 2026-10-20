import type { NodeKind } from "@/types/graph";
import { footprint, spriteSize } from "@/lib/graph/geometry";

/** Pure sizing logic for image export, kept separate from the DOM so it can be tested. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NodeLike {
  position: { x: number; y: number };
  data: { kind: NodeKind; label: string };
}

/** Bounds of every node *including* its label, which React Flow's own bounds ignore. */
export function graphBounds(nodes: readonly NodeLike[]): Rect | null {
  if (nodes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const fp = footprint(node.data.kind, node.data.label);
    const half = spriteSize(node.data.kind) / 2;
    const { x, y } = node.position;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x - fp.width / 2);
    maxX = Math.max(maxX, x + fp.width / 2);
    minY = Math.min(minY, y - half);
    maxY = Math.max(maxY, y + fp.dy + fp.height / 2);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export interface ExportGeometry {
  /** Size of the rendered graph image in CSS pixels. */
  width: number;
  height: number;
  /** Transform applied to the React Flow viewport while capturing. */
  zoom: number;
  translateX: number;
  translateY: number;
  pixelRatio: number;
  /** True when the graph was too large and had to be scaled below 1:1. */
  scaledDown: boolean;
}

export interface GeometryOptions {
  padding?: number;
  pixelRatio?: number;
  /** Maximum output side in device pixels. Browsers struggle with canvases much beyond 8k. */
  maxSide?: number;
}

export function computeExportGeometry(bounds: Rect, { padding = 80, pixelRatio = 2, maxSide = 8000 }: GeometryOptions = {}): ExportGeometry {
  const contentWidth = Math.max(1, bounds.width + padding * 2);
  const contentHeight = Math.max(1, bounds.height + padding * 2);
  const largest = Math.max(contentWidth, contentHeight);
  let ratio = pixelRatio;
  let zoom = 1;
  if (largest * ratio > maxSide) ratio = Math.max(1, maxSide / largest);
  if (largest * ratio > maxSide) zoom = maxSide / (largest * ratio);
  return {
    width: Math.ceil(contentWidth * zoom),
    height: Math.ceil(contentHeight * zoom),
    zoom,
    translateX: (padding - bounds.x) * zoom,
    translateY: (padding - bounds.y) * zoom,
    pixelRatio: ratio,
    scaledDown: zoom < 1,
  };
}

export interface FrameLayout {
  width: number;
  height: number;
  graphX: number;
  graphY: number;
  captionY: number;
  framed: boolean;
}

export const FRAME = { side: 40, top: 40, caption: 104, minWidth: 1280, minHeight: 720 } as const;

/** Positions the graph inside the final image; adds a caption band when framed. */
export function computeFrameLayout(graphWidth: number, graphHeight: number, framed: boolean): FrameLayout {
  if (!framed) {
    return { width: graphWidth, height: graphHeight, graphX: 0, graphY: 0, captionY: graphHeight, framed };
  }
  const width = Math.max(FRAME.minWidth, graphWidth + FRAME.side * 2);
  const innerHeight = Math.max(FRAME.minHeight - FRAME.top - FRAME.caption, graphHeight);
  const height = FRAME.top + innerHeight + FRAME.caption;
  return {
    width,
    height,
    graphX: Math.round((width - graphWidth) / 2),
    graphY: Math.round(FRAME.top + (innerHeight - graphHeight) / 2),
    captionY: FRAME.top + innerHeight,
    framed,
  };
}

/** "Why civilizations rise & fall?" -> "why-civilizations-rise-fall.png" */
export function exportFileName(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || "mindspace-map"}.png`;
}
