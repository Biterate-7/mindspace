"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(QUERY).matches;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

/** Live `prefers-reduced-motion` value; false during server rendering. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}

const subscribers = new Map<string, (callback: () => void) => () => void>();

function subscribeMedia(query: string) {
  const cached = subscribers.get(query);
  if (cached) return cached;
  const subscribeFn = (callback: () => void) => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
    const media = window.matchMedia(query);
    media.addEventListener("change", callback);
    return () => media.removeEventListener("change", callback);
  };
  subscribers.set(query, subscribeFn);
  return subscribeFn;
}

/** Responsive breakpoint hook backed by matchMedia. */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}
