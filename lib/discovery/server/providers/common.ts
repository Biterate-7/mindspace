import type { ProviderKind, SearchProviderId, SearchScope } from "@/types/research";
import type { RawResult } from "@/lib/discovery/rank";
import { IngestError } from "../errors";

/**
 * The search-provider contract. Every adapter maps one legitimate API (no scraped result
 * pages) to RawResult, reporting only fields the API actually returns. Adding a provider
 * means writing one adapter and registering it in `providersFromEnv`.
 */

export interface SearchPage {
  results: RawResult[];
  /** Offset to request for more results, or null when exhausted. */
  nextOffset: number | null;
}

export interface SearchOptions {
  offset: number;
  count: number;
  signal: AbortSignal;
}

export interface SearchProvider {
  id: SearchProviderId;
  label: string;
  scope: SearchScope;
  kind: ProviderKind;
  /** Works without an API key. */
  keyless: boolean;
  /** Overrides the default per-provider time budget for slow APIs. */
  timeoutMs?: number;
  search(query: string, options: SearchOptions): Promise<SearchPage>;
}

export type Fetcher = typeof fetch;

/** Identifies the client with a contact address, as Wikimedia, OpenAlex and NCBI ask API users to. */
export const USER_AGENT = "MindspaceDiscovery/0.2 (https://github.com/Biterate-7/mindspace; local research tool)";

/**
 * Reads a JSON body, turning HTTP failures into user-facing errors. Keyed providers report
 * 401/403 as a rejected key; keyless ones as a refusal (usually an anonymous rate limit).
 */
export async function readJson(response: Response, provider: string, keyed = true): Promise<unknown> {
  if (response.status === 401 || response.status === 403) {
    if (keyed) throw new IngestError("http_error", `${provider} rejected the API key. Check the key in your environment.`, 502);
    const limited = response.headers.get("x-ratelimit-remaining") === "0";
    throw new IngestError(limited ? "rate_limited" : "forbidden", limited ? `${provider} anonymous rate limit reached. Try again later.` : `${provider} refused the request (HTTP ${response.status}).`, limited ? 429 : 502);
  }
  if (response.status === 429) throw new IngestError("rate_limited", `${provider} rate limit reached. Try again in a minute.`, 429);
  if (!response.ok) throw new IngestError("http_error", `${provider} returned an error (HTTP ${response.status}).`, 502);
  try {
    return await response.json();
  } catch {
    throw new IngestError("http_error", `${provider} returned an unreadable response.`, 502);
  }
}

export async function readText(response: Response, provider: string): Promise<string> {
  if (response.status === 429) throw new IngestError("rate_limited", `${provider} rate limit reached. Try again in a minute.`, 429);
  if (!response.ok) throw new IngestError("http_error", `${provider} returned an error (HTTP ${response.status}).`, 502);
  return response.text();
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Converts an epoch-seconds timestamp to an ISO date. */
export function fromEpochSeconds(value: unknown): string | undefined {
  const n = num(value);
  return n !== undefined && n > 0 ? new Date(n * 1000).toISOString() : undefined;
}

export function compactNumber(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError");
}

/**
 * Spaces out requests to one provider across the whole server process, for APIs that ask
 * for a minimum interval between calls (arXiv: 3 s, GDELT: 5 s).
 */
export class Throttle {
  private next = 0;
  constructor(private readonly intervalMs: number) {}

  async wait(signal: AbortSignal): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.intervalMs;
    const delay = at - now;
    if (delay <= 0) return;
    if (signal.aborted) throw abortError(signal);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, delay);
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError(signal));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
