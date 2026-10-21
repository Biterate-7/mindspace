"use client";

import { create } from "zustand";
import { createGraphSlice } from "./graphSlice";
import { createLibrarySlice } from "./librarySlice";
import { createResearchSlice } from "./researchSlice";
import type { Store } from "./types";
import { createUiSlice } from "./uiSlice";

/**
 * Single application store. Shared by the canvas, inspector, sidebar, top bar and
 * keyboard shortcuts, which is exactly where a global store earns its keep.
 */
export const useMindspace = create<Store>()((...args) => ({
  ...createGraphSlice(...args),
  ...createLibrarySlice(...args),
  ...createUiSlice(...args),
  ...createResearchSlice(...args),
}));

// Handy for debugging and end-to-end checks in development builds only.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  (window as unknown as { __mindspace?: typeof useMindspace }).__mindspace = useMindspace;
}

export type { Store } from "./types";
