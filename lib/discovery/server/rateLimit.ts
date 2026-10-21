/**
 * In-memory sliding-window limiter, keyed per client. Adequate for a single local or
 * self-hosted instance; a multi-instance deployment would swap this for a shared store.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 5000,
  ) {}

  /** Records a hit and returns how many milliseconds to wait, or 0 when allowed. */
  take(key: string, now = Date.now()): number {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return recent[0] + this.windowMs - now;
    }
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value as string);
    return 0;
  }
}

/** Best-effort client identity for throttling. Behind a proxy, the first forwarded address. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "local";
}
