"use client";

import { useStoreApi } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { paintBackdrop, paintTwinkles } from "@/lib/space/starfield";
import { useReducedMotion } from "@/lib/utils/motion";

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
}

const FX_FPS = 12;

/**
 * Procedural pixel galaxy behind the graph. Two canvases: a static backdrop redrawn
 * only when the camera moves (with parallax), and a light effects layer for twinkles
 * and the occasional shooting star, throttled to a stepped 12fps. Never receives input.
 */
export function SpaceBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const store = useStoreApi();
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const container = containerRef.current;
    const base = baseRef.current;
    const fx = fxRef.current;
    if (!container || !base || !fx) return;
    const baseCtx = base.getContext("2d");
    const fxCtx = fx.getContext("2d");
    if (!baseCtx || !fxCtx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let [panX, panY] = store.getState().transform;
    let baseFrame = 0;
    let fxFrame = 0;
    let lastFx = 0;
    let nextShot = performance.now() + 6000 + Math.random() * 6000;
    let shot: ShootingStar | null = null;
    let disposed = false;

    const drawBase = () => {
      baseFrame = 0;
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBackdrop(baseCtx, { width, height, panX, panY });
    };
    const scheduleBase = () => {
      if (!baseFrame) baseFrame = requestAnimationFrame(drawBase);
    };

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
      fxCtx.imageSmoothingEnabled = false;
      drawBase();
    };

    const drawShot = (now: number) => {
      if (!shot) {
        if (now < nextShot) return;
        const fromLeft = Math.random() < 0.5;
        shot = {
          x: fromLeft ? width * (0.1 + Math.random() * 0.4) : width * (0.5 + Math.random() * 0.4),
          y: height * (0.05 + Math.random() * 0.3),
          vx: (fromLeft ? 1 : -1) * (0.5 + Math.random() * 0.25),
          vy: 0.22 + Math.random() * 0.12,
          born: now,
          life: 900,
        };
      }
      const age = now - shot.born;
      if (age > shot.life) {
        shot = null;
        nextShot = now + 9000 + Math.random() * 12000;
        return;
      }
      const fade = age < 120 ? age / 120 : 1 - (age - 120) / (shot.life - 120);
      const headX = shot.x + shot.vx * age;
      const headY = shot.y + shot.vy * age;
      for (let i = 0; i < 14; i++) {
        const t = i * 6;
        fxCtx.globalAlpha = Math.max(0, fade * (1 - i / 14) * 0.9);
        fxCtx.fillStyle = i < 2 ? "#FFFFFF" : "#C9D4FF";
        const size = i < 2 ? 2 : 1;
        fxCtx.fillRect(Math.round(headX - shot.vx * t * 1.2), Math.round(headY - shot.vy * t * 1.2), size, size);
      }
      fxCtx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      fxFrame = requestAnimationFrame(tick);
      if (now - lastFx < 1000 / FX_FPS) return;
      lastFx = now;
      fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fxCtx.clearRect(0, 0, width, height);
      paintTwinkles(fxCtx, width, height, panX, panY, now / 1000);
      drawShot(now);
    };

    const startFx = () => {
      if (reducedMotion || fxFrame || disposed) return;
      fxFrame = requestAnimationFrame(tick);
    };
    const stopFx = () => {
      cancelAnimationFrame(fxFrame);
      fxFrame = 0;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    if (reducedMotion) {
      fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintTwinkles(fxCtx, width, height, panX, panY, 0);
    } else {
      startFx();
    }

    const unsubscribe = store.subscribe((state) => {
      const [x, y] = state.transform;
      if (x === panX && y === panY) return;
      panX = x;
      panY = y;
      scheduleBase();
      if (reducedMotion) {
        fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fxCtx.clearRect(0, 0, width, height);
        paintTwinkles(fxCtx, width, height, panX, panY, 0);
      }
    });

    const onVisibility = () => (document.hidden ? stopFx() : startFx());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      observer.disconnect();
      unsubscribe();
      stopFx();
      cancelAnimationFrame(baseFrame);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [store, reducedMotion]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <canvas ref={baseRef} className="pixelated absolute inset-0" />
      <canvas ref={fxRef} className="pixelated absolute inset-0" />
    </div>
  );
}
