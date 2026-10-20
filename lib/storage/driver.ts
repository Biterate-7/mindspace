/** Minimal synchronous key-value drivers. localStorage when available, memory otherwise. */

export interface KeyValueDriver {
  /** False for the in-memory fallback: data disappears when the tab closes. */
  readonly persistent: boolean;
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export function createMemoryDriver(seed: Record<string, string> = {}): KeyValueDriver {
  const data = new Map(Object.entries(seed));
  return {
    persistent: false,
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
    keys: () => [...data.keys()],
  };
}

/** Returns null when storage is blocked (private mode, disabled cookies, sandboxed iframes). */
export function createLocalStorageDriver(): KeyValueDriver | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const probe = "mindspace:probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    const storage = window.localStorage;
    return {
      persistent: true,
      get: (key) => storage.getItem(key),
      set: (key, value) => storage.setItem(key, value),
      remove: (key) => storage.removeItem(key),
      keys: () => {
        const result: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (key) result.push(key);
        }
        return result;
      },
    };
  } catch {
    return null;
  }
}
