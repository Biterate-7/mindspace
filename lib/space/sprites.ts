import type { Category, NodeKind } from "@/types/graph";
import { SPRITE_CELLS } from "@/lib/graph/geometry";
import { createRng } from "@/lib/utils/random";
import { CATEGORY_RAMPS, CONCEPT_RAMPS, conceptRampKey, CORE_RAMP, SOURCE_RAMP, type Ramp } from "./palette";

/**
 * Procedural pixel-art sprites for celestial bodies. Sprites are built on a small
 * cell grid with ordered dithering, then emitted as merged SVG paths (one per colour),
 * so they stay razor sharp at every zoom level and export cleanly.
 */

export type SpritePart = "halo" | "ray" | "ring-back" | "body" | "ring-front" | "glint";

export interface SpriteLayer {
  part: SpritePart;
  fill: string;
  opacity: number;
  d: string;
}

export interface Sprite {
  cells: number;
  layers: SpriteLayer[];
}

const PART_ORDER: SpritePart[] = ["halo", "ray", "ring-back", "body", "ring-front", "glint"];

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => (v + 0.5) / 16));

function bayer(x: number, y: number): number {
  return BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4];
}

interface Cell {
  fill: string;
  part: SpritePart;
  opacity: number;
}

class PixelGrid {
  private readonly cells = new Map<number, Cell>();
  constructor(readonly size: number) {}

  set(x: number, y: number, fill: string, part: SpritePart, opacity = 1): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.cells.set(y * this.size + x, { fill, part, opacity });
  }

  has(x: number, y: number): boolean {
    return this.cells.has(y * this.size + x);
  }

  toSprite(): Sprite {
    const groups = new Map<string, { part: SpritePart; fill: string; opacity: number; rows: Map<number, number[]> }>();
    for (const [index, cell] of this.cells) {
      const key = `${cell.part}|${cell.fill}|${cell.opacity}`;
      let group = groups.get(key);
      if (!group) {
        group = { part: cell.part, fill: cell.fill, opacity: cell.opacity, rows: new Map() };
        groups.set(key, group);
      }
      const y = Math.floor(index / this.size);
      const row = group.rows.get(y) ?? [];
      row.push(index % this.size);
      group.rows.set(y, row);
    }
    const layers: SpriteLayer[] = [];
    for (const group of groups.values()) {
      let d = "";
      for (const [y, xs] of group.rows) {
        xs.sort((a, b) => a - b);
        let start = xs[0];
        let prev = xs[0];
        for (let i = 1; i <= xs.length; i++) {
          const x = xs[i];
          if (x === prev + 1) {
            prev = x;
            continue;
          }
          const len = prev - start + 1;
          d += `M${start} ${y}h${len}v1h-${len}z`;
          start = x;
          prev = x;
        }
      }
      layers.push({ part: group.part, fill: group.fill, opacity: group.opacity, d });
    }
    layers.sort((a, b) => PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part) || b.opacity - a.opacity);
    return { cells: this.size, layers };
  }
}

const LIGHT = (() => {
  const v = [-0.58, -0.62, 0.53];
  const len = Math.hypot(v[0], v[1], v[2]);
  return v.map((c) => c / len) as [number, number, number];
})();

function tone(ramp: Ramp, value: number): string {
  if (value > 0.84) return ramp[0];
  if (value > 0.62) return ramp[1];
  if (value > 0.38) return ramp[2];
  if (value > 0.16) return ramp[3];
  return ramp[4];
}

function quantize(alpha: number): number {
  if (alpha > 0.55) return 0.62;
  if (alpha > 0.32) return 0.38;
  return 0.18;
}

// ---------------------------------------------------------------------------

function buildCore(seed: number): Sprite {
  const size = SPRITE_CELLS.core;
  const c = (size - 1) / 2;
  const grid = new PixelGrid(size);
  const ramp = CORE_RAMP;
  const r = 8.7;
  const rnd = createRng(seed);

  // Corona: dithered falloff that fades into space.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - c, y - c);
      if (dist <= r || dist > r + 5.5) continue;
      const f = 1 - (dist - r) / 5.5;
      if (f * f * 1.15 > bayer(x, y)) grid.set(x, y, f > 0.6 ? ramp[2] : ramp[3], "halo", quantize(f * 0.9));
    }
  }
  // Diffraction rays: long cardinal spikes, short diagonals.
  for (const [dx, dy, length] of [
    [1, 0, 15],
    [-1, 0, 15],
    [0, 1, 15],
    [0, -1, 15],
    [1, 1, 5],
    [-1, 1, 5],
    [1, -1, 5],
    [-1, -1, 5],
  ] as const) {
    const diagonal = dx !== 0 && dy !== 0;
    const start = diagonal ? Math.ceil(r * 0.72) : Math.ceil(r) + 1;
    for (let i = 0; i < length; i++) {
      const s = start + i;
      const x = Math.round(c + dx * s);
      const y = Math.round(c + dy * s);
      const f = 1 - i / length;
      if (diagonal && i > 3) continue;
      grid.set(x, y, f > 0.55 ? ramp[1] : ramp[2], "ray", quantize(f));
      if (!diagonal && i < 3) {
        grid.set(x + dy, y + dx, ramp[2], "ray", 0.38);
        grid.set(x - dy, y - dx, ramp[2], "ray", 0.38);
      }
    }
  }
  // Body: hot white centre, lavender limb.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const dist = Math.hypot(dx, dy);
      if (dist > r) continue;
      const t = dist / r;
      const lit = (-dx * 0.55 - dy * 0.6) / r;
      const speckle = rnd() < 0.06 ? -0.12 : 0;
      const v = 1.02 - t * t * 0.95 + lit * 0.22 + (bayer(x, y) - 0.5) * 0.2 + speckle;
      grid.set(x, y, tone(ramp, v), "body");
    }
  }
  grid.set(Math.round(c - 4), Math.round(c - 4), "#FFFFFF", "glint");
  grid.set(Math.round(c - 3), Math.round(c - 4), "#FFFFFF", "glint");
  grid.set(Math.round(c - 4), Math.round(c - 3), "#FFFFFF", "glint");
  return grid.toSprite();
}

function buildPlanet(ramp: Ramp, seed: number): Sprite {
  const size = SPRITE_CELLS.planet;
  const c = (size - 1) / 2;
  const grid = new PixelGrid(size);
  const rnd = createRng(seed);
  const variant = seed % 4; // 0 banded, 1 cratered, 2 ringed, 3 polar cap
  const ringed = variant === 2;
  const r = ringed ? 6.3 : 7.6;
  const bandPhase = rnd() * Math.PI * 2;
  const craters = Array.from({ length: 3 }, () => {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * r * 0.6;
    return { x: c + Math.cos(a) * d, y: c + Math.sin(a) * d, r: 0.9 + rnd() * 0.9 };
  });
  const tilt = -0.32 + rnd() * 0.18;
  const ringAt = (x: number, y: number): "front" | "back" | null => {
    const dx = x - c;
    const dy = y - c;
    const u = dx * Math.cos(tilt) + dy * Math.sin(tilt);
    const w = -dx * Math.sin(tilt) + dy * Math.cos(tilt);
    const e = (u / 10.2) ** 2 + (w / 2.7) ** 2;
    if (Math.abs(e - 1) > 0.3) return null;
    return w > 0 ? "front" : "back";
  };

  // Atmosphere: a thin dithered glow, stronger on the lit side.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const dist = Math.hypot(dx, dy);
      if (dist <= r || dist > r + 2.6) continue;
      const litSide = Math.max(0, (dx * LIGHT[0] + dy * LIGHT[1]) / dist);
      const f = (1 - (dist - r) / 2.6) * (0.35 + 0.65 * litSide);
      if (f > bayer(x, y) * 1.1) grid.set(x, y, ramp[1], "halo", quantize(f * 0.8));
    }
  }
  if (ringed) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (ringAt(x, y) === "back") grid.set(x, y, ramp[3], "ring-back", 0.9);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const dist = Math.hypot(dx, dy);
      if (dist > r) continue;
      const nx = dx / r;
      const ny = dy / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      let v = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      v = 0.08 + v * 0.95;
      if (variant === 0) v += Math.sin(dy * 1.25 + bandPhase) * 0.13;
      if (variant === 1) {
        for (const crater of craters) {
          const cd = Math.hypot(x - crater.x, y - crater.y);
          if (cd < crater.r) v -= 0.22;
          else if (cd < crater.r + 0.8 && x - crater.x < 0) v += 0.08;
        }
      }
      if (variant === 3 && dy < -r * 0.62) v = Math.max(v, 0.9);
      v += (bayer(x, y) - 0.5) * 0.17;
      grid.set(x, y, tone(ramp, v), "body");
    }
  }
  if (ringed) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (ringAt(x, y) !== "front") continue;
        grid.set(x, y, x < c ? ramp[1] : ramp[2], "ring-front");
      }
    }
  }
  const gx = Math.round(c - r * 0.5);
  const gy = Math.round(c - r * 0.55);
  grid.set(gx, gy, ramp[0], "glint");
  grid.set(gx + 1, gy, ramp[0], "glint", 0.62);
  return grid.toSprite();
}

function buildStar(ramp: Ramp, seed: number): Sprite {
  const size = SPRITE_CELLS.star;
  const c = (size - 1) / 2;
  const grid = new PixelGrid(size);
  const variant = seed % 3; // 0 long four-point, 1 eight-point, 2 compact with halo
  const arm = variant === 2 ? 3 : 3 + ((seed >> 3) % 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - c, y - c);
      if (dist > 1.2 && dist < (variant === 2 ? 3.2 : 2.4) && x !== c && y !== c) {
        if (bayer(x, y) < 0.6) grid.set(x, y, ramp[2], "halo", variant === 2 ? 0.38 : 0.18);
      }
    }
  }
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    for (let i = 2; i <= arm; i++) {
      const f = (i - 1) / arm;
      grid.set(c + dx * i, c + dy * i, f < 0.45 ? ramp[1] : f < 0.75 ? ramp[2] : ramp[3], "ray", f < 0.75 ? 1 : 0.62);
    }
  }
  if (variant === 1) {
    for (const [dx, dy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const) {
      grid.set(c + dx, c + dy, ramp[1], "ray", 0.62);
      grid.set(c + dx * 2, c + dy * 2, ramp[3], "ray", 0.38);
    }
  }
  grid.set(c, c, ramp[0], "body");
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    grid.set(c + dx, c + dy, ramp[0], "body");
  }
  if (variant !== 1) {
    grid.set(c - 1, c - 1, ramp[1], "body", 0.62);
    grid.set(c + 1, c + 1, ramp[2], "body", 0.62);
  }
  return grid.toSprite();
}

function buildMoon(ramp: Ramp, seed: number): Sprite {
  const size = SPRITE_CELLS.moon;
  const c = (size - 1) / 2;
  const grid = new PixelGrid(size);
  const r = 3.4;
  const rnd = createRng(seed);
  const shadow = { x: c + 1.7 + rnd() * 0.4, y: c - 0.6 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - c, y - c);
      if (dist > r + 0.15) {
        if (dist < r + 1.3 && x < c && bayer(x, y) < 0.35) grid.set(x, y, ramp[2], "halo", 0.38);
        continue;
      }
      const inShadow = Math.hypot(x - shadow.x, y - shadow.y) < r * 0.95;
      const lit = 0.75 - dist / (r * 2.2) + (c - x) * 0.05 + (bayer(x, y) - 0.5) * 0.15;
      grid.set(x, y, inShadow ? (lit > 0.45 ? ramp[3] : ramp[4]) : tone(ramp, lit + 0.25), "body");
    }
  }
  grid.set(Math.round(c - 1.5), Math.round(c - 1.5), ramp[0], "glint");
  return grid.toSprite();
}

/**
 * A source node: a small pixel satellite (a signal from outside your own thinking),
 * with a body module, two solar wings, an antenna and a beacon light.
 */
function buildStation(seed: number): Sprite {
  const size = SPRITE_CELLS.planet;
  const c = (size - 1) / 2;
  const grid = new PixelGrid(size);
  const ramp = SOURCE_RAMP;
  const wing = 2 + (seed % 2);
  const panel = ["#7FE6F2", "#3FB7D6", "#1F6E92", "#123F5C"];

  // Faint dithered signal halo.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - c, y - c);
      if (dist > 6 && dist < 9.4 && bayer(x, y) < 0.22) grid.set(x, y, ramp[2], "halo", 0.18);
    }
  }
  // Solar wings on both sides, gridded like cells.
  for (const side of [-1, 1]) {
    for (let i = 0; i < wing * 2; i++) {
      const x = c + side * (4 + i);
      for (let y = c - 2; y <= c + 2; y++) {
        const edge = y === c - 2 || y === c + 2 || i === wing * 2 - 1;
        const seam = i % 2 === 1 && !edge;
        grid.set(x, y, edge ? panel[2] : seam ? panel[3] : y < c ? panel[0] : panel[1], "body");
      }
    }
    grid.set(c + side * 3, c, ramp[2], "body");
  }
  // Body module with a lit top-left bevel.
  for (let y = c - 3; y <= c + 3; y++) {
    for (let x = c - 2; x <= c + 2; x++) {
      const top = y === c - 3 || x === c - 2;
      const bottom = y === c + 3 || x === c + 2;
      grid.set(x, y, top ? ramp[0] : bottom ? ramp[3] : ramp[1], "body");
    }
  }
  grid.set(c, c, ramp[4], "body");
  grid.set(c - 1, c - 1, ramp[2], "body");
  // Antenna dish and mast.
  grid.set(c, c - 4, ramp[2], "body");
  grid.set(c, c - 5, ramp[1], "body");
  grid.set(c - 1, c - 6, ramp[1], "ray");
  grid.set(c + 1, c - 6, ramp[1], "ray");
  grid.set(c, c - 6, ramp[0], "ray");
  // Beacon light.
  grid.set(c, c - 7, "#5EE3F2", "glint");
  grid.set(c, c + 4, ramp[3], "body");
  return grid.toSprite();
}

const cache = new Map<string, Sprite>();

function spriteFor(kind: NodeKind, ramp: Ramp, rampKey: string, seed: number): Sprite {
  const folded = kind === "core" ? seed % 3 : kind === "planet" ? seed % 24 : kind === "star" ? seed % 12 : seed % 6;
  const key = `${kind}:${kind === "core" ? "core" : rampKey}:${folded}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const sprite =
    kind === "core" ? buildCore(folded + 1) : kind === "planet" ? buildPlanet(ramp, folded + 1) : kind === "star" ? buildStar(ramp, folded) : buildMoon(ramp, folded + 1);
  cache.set(key, sprite);
  return sprite;
}

/** Returns a memoised sprite. Seeds are folded into a small range so the cache stays tiny. */
export function getSprite(kind: NodeKind, category: Category, seed: number): Sprite {
  return spriteFor(kind, CATEGORY_RAMPS[category], category, seed);
}

/** Sprite for a Discovery node: satellites for sources, cool-toned bodies for concepts. */
export function getRoleSprite(data: { kind: NodeKind; category: Category; seed: number; role?: "source" | "concept"; concept?: { type: string } }): Sprite {
  if (data.role === "source") {
    const key = `station:${data.seed % 2}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const sprite = buildStation(data.seed % 2);
    cache.set(key, sprite);
    return sprite;
  }
  if (data.role === "concept") {
    const rampKey = conceptRampKey(data.concept?.type ?? "concept");
    const kind = data.kind === "core" ? "planet" : data.kind;
    return spriteFor(kind, CONCEPT_RAMPS[rampKey], `concept-${rampKey}`, data.seed);
  }
  return getSprite(data.kind, data.category, data.seed);
}

const pathCache = new WeakMap<SpriteLayer, Path2D>();

/** Draws a sprite onto a 2D canvas, used by the background and the image export. */
export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, pixel: number, alpha = 1): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(pixel, pixel);
  for (const layer of sprite.layers) {
    let path = pathCache.get(layer);
    if (!path) {
      path = new Path2D(layer.d);
      pathCache.set(layer, path);
    }
    ctx.globalAlpha = alpha * layer.opacity;
    ctx.fillStyle = layer.fill;
    ctx.fill(path);
  }
  ctx.restore();
}
