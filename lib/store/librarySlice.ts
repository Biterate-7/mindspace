import type { StateCreator } from "zustand";
import type { MapMeta, MindMap } from "@/types/graph";
import { DEFAULT_PREFERENCES } from "@/types/graph";
import { EmptyInputError, generateMap } from "@/lib/generation";
import { computeIntroDelays } from "@/lib/graph/intro";
import * as ops from "@/lib/graph/ops";
import { createLocalStorageDriver, createMemoryDriver } from "@/lib/storage/driver";
import { MapRepository, metaOf } from "@/lib/storage/maps";
import { createId } from "@/lib/utils/random";
import { prefersReducedMotion } from "@/lib/utils/motion";
import { resetGraphState } from "./graphSlice";
import type { LibrarySlice, MapInfo, Store } from "./types";

const SAVE_DELAY = 550;

let repo: MapRepository | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let reportedSaveError = false;
let introTimer: ReturnType<typeof setTimeout> | null = null;

function upsertMeta(maps: MapMeta[], meta: MapMeta): MapMeta[] {
  return [meta, ...maps.filter((m) => m.id !== meta.id)].sort((a, b) => b.updatedAt - a.updatedAt);
}

function buildMap(state: Store): MindMap | null {
  if (!state.current) return null;
  return { ...state.current, ...ops.toGraph(state), updatedAt: Date.now() };
}

export const createLibrarySlice: StateCreator<Store, [], [], LibrarySlice> = (set, get, api) => {
  const persistNow = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (!dirty || !repo) return;
    const state = get();
    const map = buildMap(state);
    if (!map) {
      dirty = false;
      return;
    }
    try {
      repo.save(map);
      dirty = false;
      reportedSaveError = false;
      set({
        saveStatus: repo.persistent ? "saved" : "memory",
        maps: upsertMeta(get().maps, metaOf(map)),
        current: get().current?.id === map.id ? { ...(get().current as MapInfo), updatedAt: map.updatedAt } : get().current,
      });
    } catch (error) {
      set({ saveStatus: "error" });
      if (!reportedSaveError) {
        reportedSaveError = true;
        get().toast(error instanceof Error ? `${error.message} Recent edits are kept in this tab.` : "Saving failed.", { tone: "error", duration: 6000 });
      }
    }
  };

  const schedule = (quiet: boolean) => {
    dirty = true;
    if (!quiet && get().saveStatus !== "saving") set({ saveStatus: "saving" });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistNow, quiet ? SAVE_DELAY * 2 : SAVE_DELAY);
  };

  const startIntro = (scale: number) => {
    const state = get();
    if (introTimer) clearTimeout(introTimer);
    if (prefersReducedMotion()) {
      set({ intro: null });
      return;
    }
    const plan = computeIntroDelays(state.nodes, state.edges, scale);
    const until = plan.total + 1100;
    set({ intro: { nodes: plan.nodes, edges: plan.edges, until: Date.now() + until } });
    introTimer = setTimeout(() => set({ intro: null }), until);
  };

  const loadIntoWorkspace = (map: MindMap, intro: "full" | "short") => {
    const { nodes, edges } = ops.fromGraph(map);
    const info: MapInfo = {
      id: map.id,
      title: map.title,
      createdAt: map.createdAt,
      updatedAt: map.updatedAt,
      starred: map.starred,
      source: map.source,
      viewport: map.viewport,
    };
    set({ ...resetGraphState(nodes, edges), current: info, view: "workspace", createOpen: false });
    get().setPrefs({ lastMapId: map.id });
    startIntro(intro === "full" ? 1 : 0.45);
    if (map.viewport && intro === "short") get().requestCamera({ type: "viewport", viewport: map.viewport });
    else get().requestCamera({ type: "fit", intro: intro === "full", duration: intro === "full" ? 1400 : 500 });
  };

  return {
    maps: [],
    current: null,
    saveStatus: "saved",
    storagePersistent: true,
    prefs: { ...DEFAULT_PREFERENCES },
    viewVersion: 0,

    init: () => {
      if (repo) return;
      const driver = createLocalStorageDriver();
      repo = new MapRepository(driver ?? createMemoryDriver());
      const prefs = repo.loadPrefs();
      const maps = repo.list();
      set({
        storagePersistent: repo.persistent,
        saveStatus: repo.persistent ? "saved" : "memory",
        prefs,
        maps,
        minimapOpen: prefs.minimapOpen,
        // The sidebar preference applies to wide screens; small screens start with the canvas.
        sidebarOpen: prefs.sidebarOpen && window.matchMedia("(min-width: 1024px)").matches,
      });

      api.subscribe((state, prev) => {
        if (state.version !== prev.version) schedule(false);
        else if (state.viewVersion !== prev.viewVersion) schedule(true);
      });
      const flush = () => persistNow();
      window.addEventListener("pagehide", flush);
      window.addEventListener("beforeunload", flush);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });

      if (!repo.persistent) {
        get().toast("Browser storage is unavailable, so maps will only last for this tab.", { tone: "error", duration: 7000 });
      }
      const target = prefs.lastMapId && maps.some((m) => m.id === prefs.lastMapId) ? prefs.lastMapId : maps[0]?.id;
      if (target) get().openMap(target);
      else set({ view: "create" });
    },

    generate: (mode, input) => {
      if (!repo) return false;
      let result;
      try {
        result = generateMap(mode, input);
      } catch (error) {
        get().toast(error instanceof EmptyInputError ? error.message : "Mindspace could not read that input. Try a shorter topic or plain text.", { tone: "error" });
        return false;
      }
      persistNow();
      const now = Date.now();
      const map: MindMap = {
        id: createId("m"),
        title: result.title,
        createdAt: now,
        updatedAt: now,
        starred: false,
        source: { mode, input: input.slice(0, 20000) },
        ...result.graph,
      };
      try {
        repo.save(map);
        set({ maps: upsertMeta(get().maps, metaOf(map)), saveStatus: repo.persistent ? "saved" : "memory" });
      } catch {
        set({ saveStatus: "error" });
        get().toast("Could not save the new map locally. It will stay open in this tab.", { tone: "error" });
      }
      loadIntoWorkspace(map, "full");
      get().setDraft({ input: "" });
      get().toast(`${result.graph.nodes.length} ideas mapped. ${result.summary}`, { tone: "success", duration: 5200 });
      return true;
    },

    openMap: (id) => {
      if (!repo) return;
      if (get().current?.id === id && get().view === "workspace") {
        set({ createOpen: false });
        return;
      }
      persistNow();
      const map = repo.load(id);
      if (!map) {
        try {
          repo.remove(id);
        } catch {
          // Ignore: the entry is unreadable either way.
        }
        set({ maps: get().maps.filter((m) => m.id !== id) });
        get().toast("That map could not be read and was removed from the list.", { tone: "error" });
        if (!get().current) set({ view: "create" });
        return;
      }
      loadIntoWorkspace(map, "short");
    },

    renameMap: (title) => {
      const state = get();
      const clean = title.replace(/\s+/g, " ").trim().slice(0, 120);
      if (!state.current || !clean || clean === state.current.title) return;
      set({ current: { ...state.current, title: clean }, version: state.version + 1 });
    },

    deleteMap: (id) => {
      if (!repo) return;
      const state = get();
      const isCurrent = state.current?.id === id;
      const snapshot = isCurrent ? buildMap(state) : repo.load(id);
      try {
        repo.remove(id);
      } catch {
        state.toast("Could not delete that map from local storage.", { tone: "error" });
        return;
      }
      if (isCurrent) {
        dirty = false;
        if (saveTimer) clearTimeout(saveTimer);
      }
      const maps = state.maps.filter((m) => m.id !== id);
      set({ maps });
      if (isCurrent) {
        const next = maps[0];
        if (next) get().openMap(next.id);
        else set({ ...resetGraphState([], []), current: null, view: "create", createOpen: false });
      }
      const title = snapshot?.title ?? "map";
      get().toast(`Deleted “${title}”`, {
        action: snapshot
          ? {
              label: "Undo",
              run: () => {
                if (!repo) return;
                try {
                  repo.save(snapshot);
                  set({ maps: upsertMeta(get().maps, metaOf(snapshot)) });
                  get().openMap(snapshot.id);
                } catch {
                  get().toast("Could not restore the map.", { tone: "error" });
                }
              },
            }
          : undefined,
        duration: 6000,
      });
    },

    duplicateMap: (id) => {
      if (!repo) return;
      const state = get();
      persistNow();
      const source = state.current?.id === id ? buildMap(state) : repo.load(id);
      if (!source) return;
      const now = Date.now();
      const copy: MindMap = { ...source, id: createId("m"), title: `${source.title} (copy)`.slice(0, 120), createdAt: now, updatedAt: now, starred: false };
      try {
        repo.save(copy);
      } catch {
        state.toast("Could not duplicate the map — local storage may be full.", { tone: "error" });
        return;
      }
      set({ maps: upsertMeta(get().maps, metaOf(copy)) });
      get().openMap(copy.id);
      get().toast(`Duplicated as “${copy.title}”`, { tone: "success" });
    },

    toggleStar: (id) => {
      if (!repo) return;
      const state = get();
      if (state.current?.id === id) {
        set({ current: { ...state.current, starred: !state.current.starred }, version: state.version + 1 });
        return;
      }
      const map = repo.load(id);
      if (!map) return;
      const updated = { ...map, starred: !map.starred };
      try {
        repo.save(updated);
        set({ maps: get().maps.map((m) => (m.id === id ? { ...m, starred: updated.starred } : m)) });
      } catch {
        state.toast("Could not update the map.", { tone: "error" });
      }
    },

    clearAllData: () => {
      if (!repo) return;
      repo.clearAll();
      dirty = false;
      if (saveTimer) clearTimeout(saveTimer);
      set({ ...resetGraphState([], []), maps: [], current: null, view: "create", createOpen: false, prefs: { ...DEFAULT_PREFERENCES } });
      get().toast("All local maps were deleted from this browser.");
    },

    setViewport: (viewport) => {
      const state = get();
      if (!state.current) return;
      set({ current: { ...state.current, viewport }, viewVersion: state.viewVersion + 1 });
    },

    setPrefs: (patch) => {
      const prefs = { ...get().prefs, ...patch };
      set({ prefs });
      repo?.savePrefs(prefs);
    },

    flushSave: () => persistNow(),
  };
};
