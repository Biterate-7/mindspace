import type { Graph, InputMode, MapMeta, MindMap, Preferences } from "@/types/graph";
import { DEFAULT_PREFERENCES } from "@/types/graph";
import { sanitizeResearchMeta } from "@/lib/discovery/sanitize";
import { sanitizeGraph } from "@/lib/graph/ops";
import type { KeyValueDriver } from "./driver";

/**
 * Local persistence for maps. Each map lives under its own key so a corrupt entry
 * never takes the whole library down; a small index keeps the sidebar fast.
 */

const PREFIX = "mindspace:v1:";
const MAP_PREFIX = `${PREFIX}map:`;
const INDEX_KEY = `${PREFIX}index`;
const PREFS_KEY = `${PREFIX}prefs`;
const FORMAT_VERSION = 1;

export class StorageWriteError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error && /quota/i.test(cause.name + cause.message) ? "Local storage is full." : "Could not write to local storage.");
    this.name = "StorageWriteError";
  }
}

const MODES: readonly InputMode[] = ["topic", "text", "dump"];

export function metaOf(map: MindMap): MapMeta {
  const meta: MapMeta = {
    id: map.id,
    title: map.title,
    createdAt: map.createdAt,
    updatedAt: map.updatedAt,
    starred: map.starred,
    nodeCount: map.nodes.length,
    edgeCount: map.edges.length,
    mode: map.source.mode,
  };
  if (map.workspace === "discovery") meta.workspace = "discovery";
  return meta;
}

export function serializeMap(map: MindMap): string {
  return JSON.stringify({ version: FORMAT_VERSION, map });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses and validates a stored map. Returns null for anything unusable instead of throwing. */
export function parseMap(json: string | null): MindMap | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.map)) return null;
  const raw = parsed.map;
  if (typeof raw.id !== "string" || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) return null;
  const graph = sanitizeGraph({ nodes: raw.nodes, edges: raw.edges } as Graph);
  const source = isRecord(raw.source) ? raw.source : {};
  const viewport = isRecord(raw.viewport) && [raw.viewport.x, raw.viewport.y, raw.viewport.zoom].every((v) => typeof v === "number" && Number.isFinite(v))
    ? { x: raw.viewport.x as number, y: raw.viewport.y as number, zoom: raw.viewport.zoom as number }
    : undefined;
  const now = Date.now();
  const map: MindMap = {
    id: raw.id,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Untitled map",
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : now,
    starred: raw.starred === true,
    source: {
      mode: MODES.includes(source.mode as InputMode) ? (source.mode as InputMode) : "topic",
      input: typeof source.input === "string" ? source.input : "",
    },
    viewport,
    ...graph,
  };
  // Discovery workspaces carry research metadata; maps saved before Discovery have neither field.
  if (raw.workspace === "discovery") {
    map.workspace = "discovery";
    map.research = sanitizeResearchMeta(raw.research);
  }
  return map;
}

export class MapRepository {
  constructor(private readonly driver: KeyValueDriver) {}

  get persistent(): boolean {
    return this.driver.persistent;
  }

  /** Map summaries, newest first. Rebuilds the index from map entries if it is missing or corrupt. */
  list(): MapMeta[] {
    const index = this.readIndex();
    const metas = index ?? this.rebuildIndex();
    return [...metas].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  load(id: string): MindMap | null {
    return parseMap(this.safeGet(MAP_PREFIX + id));
  }

  /** Throws StorageWriteError when the browser refuses the write (e.g. quota exceeded). */
  save(map: MindMap): void {
    try {
      this.driver.set(MAP_PREFIX + map.id, serializeMap(map));
      const metas = (this.readIndex() ?? this.rebuildIndex()).filter((m) => m.id !== map.id);
      metas.push(metaOf(map));
      this.driver.set(INDEX_KEY, JSON.stringify(metas));
    } catch (error) {
      throw new StorageWriteError(error);
    }
  }

  remove(id: string): void {
    try {
      this.driver.remove(MAP_PREFIX + id);
      const metas = (this.readIndex() ?? []).filter((m) => m.id !== id);
      this.driver.set(INDEX_KEY, JSON.stringify(metas));
    } catch (error) {
      throw new StorageWriteError(error);
    }
  }

  /** Deletes every Mindspace key, leaving other sites' data untouched. */
  clearAll(): void {
    for (const key of this.driver.keys()) if (key.startsWith(PREFIX)) this.driver.remove(key);
  }

  loadPrefs(): Preferences {
    try {
      const raw = this.safeGet(PREFS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (!isRecord(parsed)) return { ...DEFAULT_PREFERENCES };
      return {
        lastMapId: typeof parsed.lastMapId === "string" ? parsed.lastMapId : null,
        lastResearchId: typeof parsed.lastResearchId === "string" ? parsed.lastResearchId : null,
        sidebarOpen: typeof parsed.sidebarOpen === "boolean" ? parsed.sidebarOpen : DEFAULT_PREFERENCES.sidebarOpen,
        minimapOpen: typeof parsed.minimapOpen === "boolean" ? parsed.minimapOpen : DEFAULT_PREFERENCES.minimapOpen,
        exportFrame: typeof parsed.exportFrame === "boolean" ? parsed.exportFrame : DEFAULT_PREFERENCES.exportFrame,
        exportBackground: parsed.exportBackground === "plain" ? "plain" : "space",
      };
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }

  savePrefs(prefs: Preferences): void {
    try {
      this.driver.set(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Preferences are a convenience; failing to save them is not worth interrupting the user.
    }
  }

  private safeGet(key: string): string | null {
    try {
      return this.driver.get(key);
    } catch {
      return null;
    }
  }

  private readIndex(): MapMeta[] | null {
    const raw = this.safeGet(INDEX_KEY);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const metas = parsed.filter(
        (m): m is MapMeta => isRecord(m) && typeof m.id === "string" && typeof m.title === "string" && typeof m.updatedAt === "number",
      );
      return metas.map((m) => {
        const meta: MapMeta = {
          ...m,
          starred: m.starred === true,
          nodeCount: typeof m.nodeCount === "number" ? m.nodeCount : 0,
          edgeCount: typeof m.edgeCount === "number" ? m.edgeCount : 0,
          createdAt: typeof m.createdAt === "number" ? m.createdAt : m.updatedAt,
          mode: MODES.includes(m.mode) ? m.mode : "topic",
        };
        if (meta.workspace !== "discovery") delete meta.workspace;
        return meta;
      });
    } catch {
      return null;
    }
  }

  private rebuildIndex(): MapMeta[] {
    const metas: MapMeta[] = [];
    let keys: string[] = [];
    try {
      keys = this.driver.keys();
    } catch {
      return metas;
    }
    for (const key of keys) {
      if (!key.startsWith(MAP_PREFIX)) continue;
      const map = parseMap(this.safeGet(key));
      if (map) metas.push(metaOf(map));
    }
    try {
      this.driver.set(INDEX_KEY, JSON.stringify(metas));
    } catch {
      // Index is derived data; it will be rebuilt again next time.
    }
    return metas;
  }
}
