import { createRng, hashString } from "@/lib/utils/random";
import { SPACE } from "./palette";
import { drawSprite, getSprite } from "./sprites";

/**
 * Procedural deep-space backdrop: seeded star tiles and a dithered pixel nebula.
 * Tiles are generated once and reused, so drawing a frame is a handful of blits.
 * Shared by the live canvas background and the PNG export.
 */

export const NEBULA_CELL = 4; // CSS px per nebula pixel
const NEBULA_RES = 320; // nebula tile size in nebula pixels (1280 CSS px)
export const NEBULA_TILE = NEBULA_RES * NEBULA_CELL;

export interface Twinkler {
  x: number;
  y: number;
  color: string;
  phase: number;
  speed: number;
  size: number;
}

export interface StarTile {
  canvas: HTMLCanvasElement;
  size: number;
  twinklers: Twinkler[];
}

export interface StarLayer {
  tile: StarTile;
  parallax: number;
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Seamless value noise: lattice values wrap with the given period. */
function periodicNoise(seed: number, period: number): (x: number, y: number) => number {
  const lattice = new Float32Array(period * period);
  const rnd = createRng(seed);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
  const at = (ix: number, iy: number) => lattice[(((iy % period) + period) % period) * period + (((ix % period) + period) % period)];
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function fbm(x: number, y: number, octaves: Array<(x: number, y: number) => number>, scales: number[]): number {
  let total = 0;
  let amp = 0.55;
  let norm = 0;
  octaves.forEach((noise, i) => {
    total += noise(x * scales[i], y * scales[i]) * amp;
    norm += amp;
    amp *= 0.5;
  });
  return total / norm;
}

/** Dithered, posterised nebula. Hard-edged pixel clusters, no blur. */
export function createNebulaTile(seed: number): HTMLCanvasElement {
  const canvas = makeCanvas(NEBULA_RES, NEBULA_RES);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const image = ctx.createImageData(NEBULA_RES, NEBULA_RES);
  const periods = [4, 8, 16, 32];
  const scales = periods.map((p) => p / NEBULA_RES);
  const density = periods.map((p, i) => periodicNoise(seed + i * 101, p));
  const warpX = periods.slice(0, 2).map((p, i) => periodicNoise(seed + 503 + i * 17, p));
  const warpY = periods.slice(0, 2).map((p, i) => periodicNoise(seed + 709 + i * 23, p));
  const hue = periods.slice(0, 2).map((p, i) => periodicNoise(seed + 977 + i * 31, p));
  const colors = SPACE.nebula.map(hexToRgb);
  const bright = hexToRgb("#B59CFF");
  const speckle = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  for (let y = 0; y < NEBULA_RES; y++) {
    for (let x = 0; x < NEBULA_RES; x++) {
      // Domain warping bends the clouds into wisps instead of grid-aligned blobs.
      const wx = x + (fbm(x, y, warpX, scales.slice(0, 2)) - 0.5) * 46;
      const wy = y + (fbm(x, y, warpY, scales.slice(0, 2)) - 0.5) * 46;
      const n = fbm(wx, wy, density, scales);
      const h = fbm(x, y, hue, scales.slice(0, 2));
      const d = Math.min(1, Math.max(0, (n - 0.46) / 0.28));
      const r0 = speckle(x, y);
      // Sparse dust at the fringes, solid hard-edged pixels in the cores.
      let alpha = 0;
      if (d > 0.7) alpha = r0 < 0.035 ? 0.3 : 0.15;
      else if (d > 0.42) alpha = r0 < 0.16 ? 0.12 : 0.09;
      else if (d > 0.22 && r0 < (d - 0.22) * 0.9) alpha = 0.065;
      if (alpha === 0) continue;
      const colorIndex = Math.min(colors.length - 1, Math.floor(h * colors.length * 1.35) % colors.length);
      const [r, g, b] = alpha >= 0.3 ? bright : colors[colorIndex];
      const o = (y * NEBULA_RES + x) * 4;
      image.data[o] = r;
      image.data[o + 1] = g;
      image.data[o + 2] = b;
      image.data[o + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function paintStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number, shape: "dot" | "cross" | "cross8"): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  if (shape === "dot") {
    ctx.fillRect(x, y, size, size);
    return;
  }
  const arm = size * 2;
  ctx.fillRect(x, y, size, size);
  ctx.globalAlpha = alpha * 0.75;
  ctx.fillRect(x - arm, y, arm, size);
  ctx.fillRect(x + size, y, arm, size);
  ctx.fillRect(x, y - arm, size, arm);
  ctx.fillRect(x, y + size, size, arm);
  if (shape === "cross8") {
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillRect(x - size, y - size, size, size);
    ctx.fillRect(x + size, y - size, size, size);
    ctx.fillRect(x - size, y + size, size, size);
    ctx.fillRect(x + size, y + size, size, size);
  }
}

function paintGalaxy(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, rnd: () => number): void {
  const arms = 2;
  const tilt = 0.45 + rnd() * 0.3;
  const rotation = rnd() * Math.PI * 2;
  for (let i = 0; i < 70; i++) {
    const t = rnd();
    const arm = i % arms;
    const angle = rotation + arm * Math.PI + t * 3.4;
    const r = t * radius + (rnd() - 0.5) * 2;
    const x = Math.round(cx + Math.cos(angle) * r);
    const y = Math.round(cy + Math.sin(angle) * r * tilt);
    ctx.globalAlpha = 0.18 + (1 - t) * 0.35;
    ctx.fillStyle = t < 0.25 ? "#E9DEFF" : t < 0.6 ? "#9B8CFF" : "#6C7BFF";
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = "#FFF6E0";
  ctx.fillRect(Math.round(cx), Math.round(cy), 1, 1);
}

export function createStarTile(seed: number, size: number, count: number, options: { maxSize: number; crosses: number; galaxies: number; twinkle: number }): StarTile {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const twinklers: Twinkler[] = [];
  if (!ctx) return { canvas, size, twinklers };
  const rnd = createRng(seed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * size);
    const y = Math.floor(rnd() * size);
    const color = SPACE.star[Math.floor(rnd() * SPACE.star.length)];
    const s = rnd() < 0.12 ? Math.min(options.maxSize, 2) : 1;
    if (rnd() < options.twinkle) {
      twinklers.push({ x, y, color, phase: rnd() * Math.PI * 2, speed: 0.6 + rnd() * 1.4, size: s });
      continue;
    }
    paintStar(ctx, x, y, s, color, 0.25 + rnd() * 0.55, "dot");
  }
  for (let i = 0; i < options.crosses; i++) {
    const x = 8 + Math.floor(rnd() * (size - 16));
    const y = 8 + Math.floor(rnd() * (size - 16));
    const color = SPACE.star[Math.floor(rnd() * SPACE.star.length)];
    paintStar(ctx, x, y, options.maxSize > 2 ? 2 : 1, color, 0.55 + rnd() * 0.35, rnd() < 0.4 ? "cross8" : "cross");
  }
  for (let i = 0; i < options.galaxies; i++) {
    paintGalaxy(ctx, 20 + rnd() * (size - 40), 20 + rnd() * (size - 40), 7 + rnd() * 6, rnd);
  }
  ctx.globalAlpha = 1;
  return { canvas, size, twinklers };
}

export interface SpaceAssets {
  nebula: HTMLCanvasElement;
  layers: StarLayer[];
}

let assets: SpaceAssets | null = null;

/** Lazily creates (and memoises) the background tiles. Browser only. */
export function getSpaceAssets(): SpaceAssets {
  if (assets) return assets;
  const seed = hashString("mindspace-sector-001");
  assets = {
    nebula: createNebulaTile(seed),
    layers: [
      { tile: createStarTile(seed + 1, 512, 260, { maxSize: 1, crosses: 0, galaxies: 2, twinkle: 0 }), parallax: 0.025 },
      { tile: createStarTile(seed + 2, 640, 120, { maxSize: 2, crosses: 2, galaxies: 0, twinkle: 0.18 }), parallax: 0.07 },
      { tile: createStarTile(seed + 3, 896, 34, { maxSize: 3, crosses: 4, galaxies: 0, twinkle: 0.25 }), parallax: 0.15 },
    ],
  };
  return assets;
}

function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/** Tiles `image` across the canvas with an integer offset so pixels stay crisp. */
export function tileImage(ctx: CanvasRenderingContext2D, image: CanvasImageSource, tileSize: number, offsetX: number, offsetY: number, width: number, height: number): void {
  const ox = Math.round(mod(offsetX, tileSize)) - tileSize;
  const oy = Math.round(mod(offsetY, tileSize)) - tileSize;
  for (let x = ox; x < width; x += tileSize) {
    for (let y = oy; y < height; y += tileSize) ctx.drawImage(image, x, y, tileSize, tileSize);
  }
}

export interface BackdropOptions {
  width: number;
  height: number;
  /** Viewport translation in CSS px; layers move by a fraction of it. */
  panX: number;
  panY: number;
  planets?: boolean;
}

/** Paints the static part of deep space: gradient, nebula, star layers and distant planets. */
export function paintBackdrop(ctx: CanvasRenderingContext2D, { width, height, panX, panY, planets = true }: BackdropOptions): void {
  const { nebula, layers } = getSpaceAssets();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  const gradient = ctx.createRadialGradient(width * 0.5, height * 0.42, 0, width * 0.5, height * 0.42, Math.max(width, height) * 0.75);
  gradient.addColorStop(0, SPACE.navy);
  gradient.addColorStop(0.55, SPACE.deep);
  gradient.addColorStop(1, SPACE.void);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  tileImage(ctx, nebula, NEBULA_TILE, panX * 0.045 + 140, panY * 0.045 - 260, width, height);
  for (const layer of layers) tileImage(ctx, layer.tile.canvas, layer.tile.size, panX * layer.parallax, panY * layer.parallax, width, height);

  if (planets) {
    const drift = (factor: number) => ({ x: panX * factor, y: panY * factor });
    const a = drift(0.012);
    drawSprite(ctx, getSprite("planet", "process", 6), width * 0.9 + a.x - 30, height * 0.12 + a.y, 2, 0.5);
    const b = drift(0.018);
    drawSprite(ctx, getSprite("moon", "note", 3), width * 0.05 + b.x, height * 0.86 + b.y, 2, 0.45);
  }
  ctx.globalAlpha = 1;
}

/** Draws twinkling stars for the current time. Stepped alpha keeps the pixel-art feel. */
export function paintTwinkles(ctx: CanvasRenderingContext2D, width: number, height: number, panX: number, panY: number, time: number): void {
  const { layers } = getSpaceAssets();
  for (const layer of layers) {
    const { size, twinklers } = layer.tile;
    if (twinklers.length === 0) continue;
    const ox = Math.round(mod(panX * layer.parallax, size)) - size;
    const oy = Math.round(mod(panY * layer.parallax, size)) - size;
    for (const t of twinklers) {
      const wave = (Math.sin(time * t.speed + t.phase) + 1) / 2;
      const alpha = wave > 0.85 ? 0.95 : wave > 0.55 ? 0.6 : wave > 0.25 ? 0.32 : 0.12;
      const shape = wave > 0.9 && t.size > 1 ? "cross" : "dot";
      for (let x = ox + t.x; x < width; x += size) {
        if (x < -4) continue;
        for (let y = oy + t.y; y < height; y += size) {
          if (y < -4) continue;
          paintStar(ctx, x, y, t.size, t.color, alpha, shape);
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}
