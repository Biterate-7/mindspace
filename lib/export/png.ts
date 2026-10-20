import { getFontEmbedCSS, toCanvas } from "html-to-image";
import type { IdeaNode } from "@/types/graph";
import { SPACE } from "@/lib/space/palette";
import { paintBackdrop } from "@/lib/space/starfield";
import { computeExportGeometry, computeFrameLayout, graphBounds, type FrameLayout } from "./geometry";

/**
 * PNG export. The React Flow viewport is captured at 1:1 around the bounds of *all*
 * nodes (not just what is on screen), then composited over a freshly painted
 * deep-space backdrop with an optional caption frame.
 */

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

export interface ExportOptions {
  title: string;
  frame: boolean;
  background: "space" | "plain";
  edgeCount: number;
  pixelRatio?: number;
}

const EXCLUDED_CLASSES = ["react-flow__handle", "ms-noexport", "react-flow__minimap", "react-flow__panel", "react-flow__selection", "react-flow__nodesselection"];

function keep(node: Node): boolean {
  if (!(node instanceof Element)) return true;
  return !EXCLUDED_CLASSES.some((c) => node.classList.contains(c));
}

let fontCss: Promise<string> | null = null;

function fontsFor(element: HTMLElement): Promise<string> {
  fontCss ??= getFontEmbedCSS(element).catch(() => "");
  return fontCss;
}

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function drawFrame(ctx: CanvasRenderingContext2D, layout: FrameLayout, options: ExportOptions, nodeCount: number): void {
  const pixelFont = cssVar("--font-pixel", "monospace");
  const sansFont = cssVar("--font-geist-sans", "system-ui, sans-serif");
  const { width, captionY } = layout;
  const inset = 20;

  // Hairline border with pixel corner accents.
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(160, 170, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.strokeRect(inset + 0.5, inset + 0.5, width - inset * 2 - 1, layout.height - inset * 2 - 1);
  ctx.fillStyle = "#B9A4FF";
  for (const [x, y] of [
    [inset - 2, inset - 2],
    [width - inset - 2, inset - 2],
    [inset - 2, layout.height - inset - 2],
    [width - inset - 2, layout.height - inset - 2],
  ]) {
    ctx.fillRect(x, y, 5, 5);
  }

  // Caption band.
  ctx.fillStyle = "rgba(160, 170, 255, 0.12)";
  ctx.fillRect(inset + 24, captionY + 8, width - inset * 2 - 48, 1);

  const baseY = captionY + 54;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#EEF0FF";
  ctx.font = `600 26px ${sansFont}`;
  const maxTitleWidth = width * 0.62;
  let title = options.title;
  while (ctx.measureText(title).width > maxTitleWidth && title.length > 4) title = `${title.slice(0, -2).trimEnd()}…`;
  ctx.fillText(title, inset + 28, baseY);

  ctx.font = `10px ${pixelFont}`;
  ctx.fillStyle = "#8B91B8";
  const date = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
  ctx.fillText(`${nodeCount} STARS  ·  ${options.edgeCount} LINKS  ·  ${date}`, inset + 28, baseY + 24);

  // Wordmark: a tiny pixel star followed by MINDSPACE.
  ctx.font = `16px ${pixelFont}`;
  const word = "MINDSPACE";
  const wordWidth = ctx.measureText(word).width;
  const right = width - inset - 28;
  ctx.fillStyle = "#EEF0FF";
  ctx.fillText(word, right - wordWidth, baseY - 2);
  const sx = right - wordWidth - 22;
  const sy = baseY - 14;
  ctx.fillStyle = "#B9A4FF";
  ctx.fillRect(sx + 4, sy, 3, 12);
  ctx.fillRect(sx, sy + 4, 11, 3);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(sx + 4, sy + 4, 3, 3);
  ctx.font = `8px ${pixelFont}`;
  ctx.fillStyle = "#6E7499";
  const tag = "PUT YOUR BRAIN ON A MAP";
  ctx.fillText(tag, right - ctx.measureText(tag).width, baseY + 22);
}

export async function renderGraphPng(viewport: HTMLElement, flowRoot: HTMLElement, nodes: readonly IdeaNode[], options: ExportOptions): Promise<{ blob: Blob; scaledDown: boolean }> {
  const bounds = graphBounds(nodes);
  if (!bounds) throw new ExportError("There is nothing to export yet. Add an idea first.");

  const geometry = computeExportGeometry(bounds, { pixelRatio: options.pixelRatio ?? 2 });
  const layout = computeFrameLayout(geometry.width, geometry.height, options.frame);

  flowRoot.classList.add("is-exporting");
  try {
    await document.fonts?.ready;
    await nextFrame();
    const fontEmbedCSS = await fontsFor(viewport);
    const graph = await toCanvas(viewport, {
      width: geometry.width,
      height: geometry.height,
      pixelRatio: geometry.pixelRatio,
      skipAutoScale: true,
      filter: keep,
      fontEmbedCSS: fontEmbedCSS || undefined,
      style: {
        width: `${geometry.width}px`,
        height: `${geometry.height}px`,
        transform: `translate(${geometry.translateX}px, ${geometry.translateY}px) scale(${geometry.zoom})`,
      },
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(layout.width * geometry.pixelRatio);
    canvas.height = Math.round(layout.height * geometry.pixelRatio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ExportError("Your browser could not create an image canvas.");
    ctx.scale(geometry.pixelRatio, geometry.pixelRatio);
    if (options.background === "space") {
      paintBackdrop(ctx, { width: layout.width, height: layout.height, panX: 0, panY: 0, planets: true });
    } else {
      ctx.fillStyle = SPACE.deep;
      ctx.fillRect(0, 0, layout.width, layout.height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(graph, layout.graphX, layout.graphY, geometry.width, geometry.height);
    if (layout.framed) drawFrame(ctx, layout, options, nodes.length);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new ExportError("The image was too large for your browser to encode. Try turning off the frame or deleting distant ideas.");
    return { blob, scaledDown: geometry.scaledDown };
  } finally {
    flowRoot.classList.remove("is-exporting");
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
