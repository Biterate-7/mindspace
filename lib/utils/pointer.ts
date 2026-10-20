/** Tiny external store for the canvas cursor position (flow coordinates), read by the status bar. */

type Listener = () => void;

let position: { x: number; y: number } | null = null;
const listeners = new Set<Listener>();
let frame = 0;

export const pointerStore = {
  get: () => position,
  set(next: { x: number; y: number } | null) {
    position = next;
    if (frame || typeof requestAnimationFrame === "undefined") return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      listeners.forEach((l) => l());
    });
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
