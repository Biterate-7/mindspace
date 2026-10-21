/**
 * Local store for imported article text. Full text is kept out of the lightweight
 * graph (localStorage) and lives in IndexedDB, in this browser only, so sources can be
 * re-analysed without fetching again. Removing a source or its content deletes it here.
 */

export interface StoredContent {
  key: string;
  mapId: string;
  sourceId: string;
  url: string;
  text: string;
  savedAt: number;
}

export interface ContentStore {
  readonly persistent: boolean;
  get(mapId: string, sourceId: string): Promise<StoredContent | null>;
  put(entry: Omit<StoredContent, "key" | "savedAt">): Promise<void>;
  remove(mapId: string, sourceId: string): Promise<void>;
  removeMap(mapId: string): Promise<void>;
  copyMap(fromMapId: string, toMapId: string, sourceIds?: ReadonlySet<string>): Promise<void>;
  clear(): Promise<void>;
  /** Number of stored entries and total characters for a workspace. */
  usage(mapId: string): Promise<{ count: number; chars: number }>;
}

export const MAX_STORED_CHARS = 100_000;

const keyOf = (mapId: string, sourceId: string) => `${mapId}::${sourceId}`;

export function createMemoryContentStore(): ContentStore {
  const data = new Map<string, StoredContent>();
  return {
    persistent: false,
    async get(mapId, sourceId) {
      return data.get(keyOf(mapId, sourceId)) ?? null;
    },
    async put(entry) {
      const key = keyOf(entry.mapId, entry.sourceId);
      data.set(key, { ...entry, text: entry.text.slice(0, MAX_STORED_CHARS), key, savedAt: Date.now() });
    },
    async remove(mapId, sourceId) {
      data.delete(keyOf(mapId, sourceId));
    },
    async removeMap(mapId) {
      for (const [key, value] of data) if (value.mapId === mapId) data.delete(key);
    },
    async copyMap(fromMapId, toMapId, sourceIds) {
      for (const value of [...data.values()]) {
        if (value.mapId !== fromMapId || (sourceIds && !sourceIds.has(value.sourceId))) continue;
        const key = keyOf(toMapId, value.sourceId);
        data.set(key, { ...value, key, mapId: toMapId });
      }
    },
    async clear() {
      data.clear();
    },
    async usage(mapId) {
      let count = 0;
      let chars = 0;
      for (const value of data.values()) {
        if (value.mapId !== mapId) continue;
        count++;
        chars += value.text.length;
      }
      return { count, chars };
    },
  };
}

const DB_NAME = "mindspace-content";
const STORE = "texts";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "key" });
        store.createIndex("mapId", "mapId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Content database is blocked by another tab."));
  });
}

function createIndexedDbContentStore(): ContentStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  const db = () => (dbPromise ??= openDb());
  const byMap = async (mapId: string): Promise<StoredContent[]> => {
    const tx = (await db()).transaction(STORE, "readonly");
    return request(tx.objectStore(STORE).index("mapId").getAll(IDBKeyRange.only(mapId))) as Promise<StoredContent[]>;
  };
  return {
    persistent: true,
    async get(mapId, sourceId) {
      const tx = (await db()).transaction(STORE, "readonly");
      return ((await request(tx.objectStore(STORE).get(keyOf(mapId, sourceId)))) as StoredContent | undefined) ?? null;
    },
    async put(entry) {
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ ...entry, text: entry.text.slice(0, MAX_STORED_CHARS), key: keyOf(entry.mapId, entry.sourceId), savedAt: Date.now() });
      await done(tx);
    },
    async remove(mapId, sourceId) {
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(keyOf(mapId, sourceId));
      await done(tx);
    },
    async removeMap(mapId) {
      const entries = await byMap(mapId);
      if (entries.length === 0) return;
      const tx = (await db()).transaction(STORE, "readwrite");
      for (const entry of entries) tx.objectStore(STORE).delete(entry.key);
      await done(tx);
    },
    async copyMap(fromMapId, toMapId, sourceIds) {
      const entries = (await byMap(fromMapId)).filter((e) => !sourceIds || sourceIds.has(e.sourceId));
      if (entries.length === 0) return;
      const tx = (await db()).transaction(STORE, "readwrite");
      for (const entry of entries) tx.objectStore(STORE).put({ ...entry, key: keyOf(toMapId, entry.sourceId), mapId: toMapId });
      await done(tx);
    },
    async clear() {
      const tx = (await db()).transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      await done(tx);
    },
    async usage(mapId) {
      const entries = await byMap(mapId);
      return { count: entries.length, chars: entries.reduce((sum, e) => sum + e.text.length, 0) };
    },
  };
}

let shared: ContentStore | null = null;

/** IndexedDB when available; otherwise text lasts only for this tab (and the UI says so). */
export function contentStore(): ContentStore {
  if (shared) return shared;
  shared = typeof indexedDB !== "undefined" ? createIndexedDbContentStore() : createMemoryContentStore();
  return shared;
}

/** Test hook. */
export function setContentStore(store: ContentStore | null): void {
  shared = store;
}

/** Stable fingerprint of article text for duplicate detection (case/whitespace-insensitive). */
export async function contentHash(text: string): Promise<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 20000);
  const subtle = typeof crypto !== "undefined" ? crypto.subtle : undefined;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(normalized));
    return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Insecure contexts lack SubtleCrypto; fall back to a 64-bit FNV pair.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return `f${(h1 >>> 0).toString(16)}${(h2 >>> 0).toString(16)}`;
}
