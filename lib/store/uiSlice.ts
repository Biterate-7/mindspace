import type { StateCreator } from "zustand";
import { createId } from "@/lib/utils/random";
import type { Store, UiSlice } from "./types";

const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const createUiSlice: StateCreator<Store, [], [], UiSlice> = (set, get) => ({
  view: "loading",
  createOpen: false,
  sidebarOpen: true,
  inspectorOpen: true,
  minimapOpen: false,
  dialog: null,
  toasts: [],
  camera: null,
  draft: { mode: "topic", input: "" },

  openCreate: () => {
    if (get().view === "workspace") set({ createOpen: true });
    else set({ view: "create" });
  },

  closeCreate: () => {
    if (get().current) set({ createOpen: false, view: "workspace" });
  },

  setDraft: (draft) => set({ draft: { ...get().draft, ...draft } }),

  toggleSidebar: (open) => {
    const sidebarOpen = open ?? !get().sidebarOpen;
    set({ sidebarOpen });
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) get().setPrefs({ sidebarOpen });
  },

  toggleInspector: (open) => set({ inspectorOpen: open ?? !get().inspectorOpen }),

  toggleMinimap: () => {
    const minimapOpen = !get().minimapOpen;
    set({ minimapOpen });
    get().setPrefs({ minimapOpen });
  },

  setDialog: (dialog) => set({ dialog }),

  toast: (message, options = {}) => {
    const id = createId("t");
    const toast = { id, message, tone: options.tone ?? "info", action: options.action };
    set({ toasts: [...get().toasts.slice(-3), toast] });
    const timer = setTimeout(() => get().dismissToast(id), options.duration ?? (options.action ? 5600 : 3400));
    toastTimers.set(id, timer);
  },

  dismissToast: (id) => {
    const timer = toastTimers.get(id);
    if (timer) clearTimeout(timer);
    toastTimers.delete(id);
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  requestCamera: (request) => set({ camera: { ...request, nonce: Date.now() + Math.random() } as Store["camera"] }),
});
