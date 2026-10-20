/** Small deterministic helpers: string hashing, seeded PRNG and id creation. */

/** 32-bit FNV-1a hash. Stable across platforms and sessions. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32 PRNG. Returns a function producing floats in [0, 1). */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(items: readonly T[], rnd: () => number): T {
  return items[Math.floor(rnd() * items.length) % items.length];
}

let counter = 0;

/** Creates an id that is unique within this browser session and very unlikely to collide across sessions. */
export function createId(prefix: string, taken?: ReadonlySet<string>): string {
  for (;;) {
    counter = (counter + 1) % 1679616;
    const random =
      typeof crypto !== "undefined" && "getRandomValues" in crypto
        ? crypto.getRandomValues(new Uint32Array(1))[0]
        : Math.floor(Math.random() * 0xffffffff);
    const id = `${prefix}_${random.toString(36)}${counter.toString(36)}`;
    if (!taken || !taken.has(id)) return id;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
