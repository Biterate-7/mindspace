import { hashString } from "@/lib/utils/random";

export interface Point {
  x: number;
  y: number;
}

export interface EdgeGeometry {
  d: string;
  mid: Point;
  /** Point and tangent angle (degrees) close to the target, for the direction marker. */
  head: Point & { angle: number };
  sparks: Point[];
}

function quad(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}

function quadTangent(p0: Point, c: Point, p1: Point, t: number): number {
  const dx = 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x);
  const dy = 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Gently curved route between two bodies, trimmed to their rims.
 * Curvature direction is stable per edge id so the galaxy doesn't shimmer between renders.
 */
export function edgeGeometry(id: string, from: Point, to: Point, fromRadius: number, toRadius: number): EdgeGeometry {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.max(1, Math.hypot(dx, dy));
  const hash = hashString(id);
  const bend = (hash % 2 === 0 ? 1 : -1) * Math.min(dist * 0.11, 56) * (0.55 + ((hash >> 3) % 10) / 20);
  const control = { x: (from.x + to.x) / 2 - (dy / dist) * bend, y: (from.y + to.y) / 2 + (dx / dist) * bend };

  const trim = (p: Point, towards: Point, r: number): Point => {
    const vx = towards.x - p.x;
    const vy = towards.y - p.y;
    const len = Math.max(1, Math.hypot(vx, vy));
    const amount = Math.min(r, len * 0.45);
    return { x: p.x + (vx / len) * amount, y: p.y + (vy / len) * amount };
  };
  const start = trim(from, control, fromRadius);
  const end = trim(to, control, toRadius);
  const round = (n: number) => Math.round(n * 10) / 10;
  const d = `M${round(start.x)} ${round(start.y)} Q${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`;
  const headPoint = quad(start, control, end, 0.9);
  return {
    d,
    mid: quad(start, control, end, 0.5),
    head: { ...headPoint, angle: quadTangent(start, control, end, 0.9) },
    sparks: [quad(start, control, end, 0.28), quad(start, control, end, 0.72)],
  };
}
