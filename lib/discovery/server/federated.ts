import type { ProviderOutcome, ProviderStatusCode, SearchResult } from "@/types/research";
import { planResearch, type ResearchPlan } from "@/lib/discovery/plan";
import { rankFederated, type Candidate } from "@/lib/discovery/rank";
import { TtlCache } from "./cache";
import { IngestError } from "./errors";
import type { SearchPage, SearchProvider } from "./providers/common";

/**
 * Federated search: one question becomes several complementary queries, sent in parallel
 * to every provider relevant to the topic. Each provider has its own timeout and one
 * retry for transient failures; a slow or failing provider never blocks the others, and
 * its outcome is reported as it is — failed, timed out, rate limited, empty or skipped.
 * There is no silent fallback: if every provider fails, the search fails.
 */

export const PAGE_SIZE = 10;
const MAX_PAGES = 4;

export interface FederatedOptions {
  signal: AbortSignal;
  /** 0 for the first page; "more results" asks for the next page of every provider that has one. */
  page?: number;
  exclude?: ReadonlySet<string>;
  timeoutMs?: number;
  cache?: TtlCache<SearchPage> | null;
  /** Called whenever a provider finishes, with the ranked results so far. */
  onProgress?: (outcome: ProviderOutcome, results: SearchResult[]) => void;
  now?: number;
}

export interface FederatedResult {
  plan: ResearchPlan;
  results: SearchResult[];
  outcomes: ProviderOutcome[];
  nextOffset: number | null;
  /** Every provider that ran failed; the result is a search failure, not "no results". */
  failed: boolean;
}

const sharedCache = new TtlCache<SearchPage>(400, 10 * 60_000);

export function queriesFor(provider: SearchProvider, plan: ResearchPlan): string[] {
  // Keyed general web search is always relevant; keyless indexes only when the topic needs them.
  if (!provider.keyless || plan.providers.has(provider.id)) return plan.queries[provider.kind];
  return [];
}

function statusOf(error: unknown): { status: ProviderStatusCode; message: string } {
  if (error instanceof IngestError) return { status: error.code === "rate_limited" ? "rate_limited" : "failed", message: error.message };
  const name = (error as Error)?.name;
  if (name === "TimeoutError" || name === "AbortError") return { status: "timeout", message: "Took too long to answer." };
  return { status: "failed", message: "Could not be reached." };
}

function transient(error: unknown): boolean {
  if (error instanceof IngestError) return error.code === "http_error" && (error.httpStatus ?? 0) >= 500;
  return (error as Error)?.name !== "AbortError" && (error as Error)?.name !== "TimeoutError";
}

async function fetchPage(provider: SearchProvider, query: string, offset: number, signal: AbortSignal, cache: TtlCache<SearchPage> | null): Promise<SearchPage> {
  const key = `${provider.id}|${offset}|${query.toLowerCase()}`;
  const cached = cache?.get(key);
  if (cached) return cached;
  let page: SearchPage;
  try {
    page = await provider.search(query, { offset, count: PAGE_SIZE, signal });
  } catch (error) {
    if (signal.aborted || !transient(error)) throw error;
    // One quick retry for network blips and 5xx answers.
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (signal.aborted) throw error;
    page = await provider.search(query, { offset, count: PAGE_SIZE, signal });
  }
  cache?.set(key, page);
  return page;
}

export async function federatedSearch(question: string, providers: readonly SearchProvider[], options: FederatedOptions): Promise<FederatedResult> {
  const plan = planResearch(question);
  const page = Math.max(0, Math.min(MAX_PAGES - 1, options.page ?? 0));
  const cache = options.cache === undefined ? sharedCache : options.cache;
  const candidates: Candidate[] = [];
  const outcomes = new Map<string, ProviderOutcome>();
  let more = false;

  const rank = () => rankFederated(candidates, plan.question, { facets: plan.facets, recency: plan.recency, terms: plan.terms, exclude: options.exclude, now: options.now });

  const runProvider = async (provider: SearchProvider): Promise<void> => {
    const queries = queriesFor(provider, plan);
    if (queries.length === 0) {
      outcomes.set(provider.id, { id: provider.id, label: provider.label, status: "skipped", count: 0, message: "Not relevant to this topic.", queries: [] });
      return;
    }
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? provider.timeoutMs ?? 10_000)]);
    let count = 0;
    let error: unknown = null;
    for (const query of queries) {
      try {
        const result = await fetchPage(provider, query, page * PAGE_SIZE, signal, cache);
        result.results.forEach((r, i) => candidates.push({ result: r, provider: provider.id, rank: i, query }));
        count += result.results.length;
        if (result.nextOffset !== null) more = true;
      } catch (e) {
        error = e;
        // Keep what earlier queries found; stop asking a provider that is down or limiting us.
        break;
      }
    }
    const failure = error && count === 0 ? statusOf(error) : null;
    const outcome: ProviderOutcome = failure
      ? { id: provider.id, label: provider.label, status: failure.status, count: 0, message: failure.message, queries }
      : { id: provider.id, label: provider.label, status: count > 0 ? "ok" : "empty", count, queries, ...(error ? { message: `Partial: ${statusOf(error).message}` } : {}) };
    outcomes.set(provider.id, outcome);
    if (!options.signal.aborted) options.onProgress?.(outcome, rank());
  };

  await Promise.all(providers.map(runProvider));
  const ordered = providers.map((p) => outcomes.get(p.id) as ProviderOutcome);
  const ran = ordered.filter((o) => o.status !== "skipped");
  const failed = ran.length > 0 && ran.every((o) => o.status === "failed" || o.status === "timeout" || o.status === "rate_limited");
  return { plan, results: rank(), outcomes: ordered, nextOffset: more && page + 1 < MAX_PAGES ? page + 1 : null, failed };
}
