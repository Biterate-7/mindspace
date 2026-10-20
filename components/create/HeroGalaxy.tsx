"use client";

import { useEffect, useRef } from "react";
import { paintBackdrop, paintTwinkles } from "@/lib/space/starfield";
import { drawSprite, getSprite } from "@/lib/space/sprites";
import { createRng } from "@/lib/utils/random";
import { useReducedMotion } from "@/lib/utils/motion";

/**
 * The landing galaxy: a slowly turning pixel-art spiral rendered into a low-resolution
 * buffer and scaled up with nearest-neighbour filtering, over a drifting starfield with
 * a few distant planets on slow orbits.
 */

const CELL = 3; // CSS px per galaxy pixel
const FPS = 20;

interface Particle {
  r: number; // 0..1 radius
  theta: number;
  color: [number, number, number];
  weight: number;
}

const PALETTE = {
  core: [255, 246, 224] as [number, number, number],
  inner: [233, 222, 255] as [number, number, number],
  violet: [155, 123, 255] as [number, number, number],
  blue: [111, 147, 255] as [number, number, number],
  cyan: [94, 227, 242] as [number, number, number],
  magenta: [242, 98, 159] as [number, number, number],
};

function createGalaxy(count: number): Particle[] {
  const rnd = createRng(20261020);
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const inBulge = i < count * 0.18;
    const r = inBulge ? Math.abs(gauss()) * 0.16 : 0.08 + Math.pow(rnd(), 0.75) * 0.92;
    const arm = i % 2;
    const spiral = inBulge ? rnd() * Math.PI * 2 : arm * Math.PI + Math.log(1 + r * 9) * 2.15 + gauss() * (0.42 - r * 0.22);
    let color = PALETTE.violet;
    if (r < 0.1) color = PALETTE.core;
    else if (r < 0.22) color = PALETTE.inner;
    else if (r < 0.5) color = rnd() < 0.7 ? PALETTE.violet : PALETTE.blue;
    else color = rnd() < 0.55 ? PALETTE.blue : rnd() < 0.6 ? PALETTE.cyan : PALETTE.magenta;
    particles.push({ r, theta: spiral, color, weight: inBulge ? 0.5 : 0.28 + rnd() * 0.5 });
  }
  return particles;
}

export function HeroGalaxy({ anchor = { x: 0.66, y: 0.5 } }: { anchor?: { x: number; y: number } }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const galaxyRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();
  const { x: anchorX, y: anchorY } = anchor;

  useEffect(() => {
    const container = containerRef.current;
    const base = baseRef.current;
    const galaxyCanvas = galaxyRef.current;
    const fx = fxRef.current;
    if (!container || !base || !galaxyCanvas || !fx) return;
    const baseCtx = base.getContext("2d");
    const gCtx = galaxyCanvas.getContext("2d");
    const fxCtx = fx.getContext("2d");
    if (!baseCtx || !gCtx || !fxCtx) return;

    const particles = createGalaxy(3200);
    let width = 0;
    let height = 0;
    let dpr = 1;
    let gw = 0;
    let gh = 0;
    let radius = 0;
    let image: ImageData | null = null;
    let accum: Float32Array = new Float32Array(0);
    let frame = 0;
    let last = 0;
    const planets = [
      { sprite: getSprite("planet", "impact", 2), orbit: 0.43, speed: 0.05, phase: 1.2, scale: 2 },
      { sprite: getSprite("planet", "process", 10), orbit: 0.62, speed: -0.03, phase: 4.1, scale: 2 },
      { sprite: getSprite("moon", "question", 1), orbit: 0.3, speed: 0.08, phase: 2.6, scale: 2 },
    ];

    const resize = () => {
      const rect = container.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      for (const canvas of [base, fx]) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      radius = Math.min(width * 0.36, height * 0.62, 560);
      gw = Math.ceil((radius * 2.3) / CELL);
      gh = Math.ceil((radius * 1.3) / CELL);
      galaxyCanvas.width = gw;
      galaxyCanvas.height = gh;
      galaxyCanvas.style.width = `${gw * CELL}px`;
      galaxyCanvas.style.height = `${gh * CELL}px`;
      galaxyCanvas.style.left = `${Math.round(width * anchorX - (gw * CELL) / 2)}px`;
      galaxyCanvas.style.top = `${Math.round(height * anchorY - (gh * CELL) / 2)}px`;
      image = gCtx.createImageData(gw, gh);
      accum = new Float32Array(gw * gh * 3);
    };

    const drawGalaxy = (t: number) => {
      if (!image) return;
      accum.fill(0);
      const cx = gw / 2;
      const cy = gh / 2;
      const rx = radius / CELL;
      const tilt = 0.44;
      const roll = -0.32;
      const cosR = Math.cos(roll);
      const sinR = Math.sin(roll);
      for (const p of particles) {
        const angle = p.theta + t * 0.045 * (1.25 - p.r * 0.6);
        const px = Math.cos(angle) * p.r * rx;
        const py = Math.sin(angle) * p.r * rx * tilt;
        const x = Math.round(cx + px * cosR - py * sinR);
        const y = Math.round(cy + px * sinR + py * cosR);
        if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        const o = (y * gw + x) * 3;
        accum[o] += p.color[0] * p.weight;
        accum[o + 1] += p.color[1] * p.weight;
        accum[o + 2] += p.color[2] * p.weight;
      }
      const data = image.data;
      for (let i = 0, j = 0; i < accum.length; i += 3, j += 4) {
        const r = accum[i];
        const g = accum[i + 1];
        const b = accum[i + 2];
        const peak = Math.max(r, g, b);
        if (peak < 24) {
          data[j + 3] = 0;
          continue;
        }
        // Posterise brightness into a few hard steps for a hand-made pixel look.
        const level = peak > 420 ? 1 : peak > 240 ? 0.85 : peak > 120 ? 0.62 : 0.38;
        const scale = (255 / peak) * level;
        data[j] = Math.min(255, r * scale + (level === 1 ? 40 : 0));
        data[j + 1] = Math.min(255, g * scale + (level === 1 ? 40 : 0));
        data[j + 2] = Math.min(255, b * scale + (level === 1 ? 30 : 0));
        data[j + 3] = Math.round(255 * Math.min(1, 0.35 + level * 0.65));
      }
      gCtx.putImageData(image, 0, 0);
    };

    const drawScene = (now: number) => {
      const t = now / 1000;
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBackdrop(baseCtx, { width, height, panX: -t * 14, panY: -t * 4, planets: false });
      drawGalaxy(t);
      fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fxCtx.clearRect(0, 0, width, height);
      paintTwinkles(fxCtx, width, height, -t * 14, -t * 4, t);
      const gx = width * anchorX;
      const gy = height * anchorY;
      for (const planet of planets) {
        const a = planet.phase + t * planet.speed;
        const px = gx + Math.cos(a) * radius * planet.orbit * 1.9;
        const py = gy + Math.sin(a) * radius * planet.orbit * 0.62;
        const size = planet.sprite.cells * planet.scale;
        drawSprite(fxCtx, planet.sprite, px - size / 2, py - size / 2, planet.scale, Math.sin(a) > -0.2 ? 0.95 : 0.55);
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - last < 1000 / FPS) return;
      last = now;
      drawScene(now);
    };

    resize();
    drawScene(reducedMotion ? 0 : performance.now());
    const observer = new ResizeObserver(() => {
      resize();
      drawScene(reducedMotion ? 0 : performance.now());
    });
    observer.observe(container);
    if (!reducedMotion) frame = requestAnimationFrame(loop);
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reducedMotion) frame = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reducedMotion, anchorX, anchorY]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <canvas ref={baseRef} className="pixelated absolute inset-0" />
      <canvas ref={galaxyRef} className="pixelated absolute" />
      <canvas ref={fxRef} className="pixelated absolute inset-0" />
    </div>
  );
}
