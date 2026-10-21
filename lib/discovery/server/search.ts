import type { DiscoveryConfig, SearchProviderId, SearchScope } from "@/types/research";
import type { RawResult } from "@/lib/discovery/rank";
import { IngestError } from "./errors";

/**
 * Search provider abstraction. Providers run only on the server, so API keys never
 * reach the browser. Swap or add providers here without touching the client.
 *
 *   BRAVE_SEARCH_API_KEY  → Brave Search API (web)
 *   TAVILY_API_KEY        → Tavily Search API (web)
 *   DISCOVERY_SEARCH_PROVIDER=brave|tavily picks one when both keys are set.
 *   Wikipedia search needs no key and is labelled as encyclopedia-only.
 *   DISCOVERY_DISABLE_WIKIPEDIA=1 turns it off.
 */

export interface SearchPage {
  results: RawResult[];
  /** Offset to request for more results, or null when exhausted. */
  nextOffset: number | null;
}

export interface SearchProvider {
  id: SearchProviderId;
  label: string;
  scope: SearchScope;
  search(query: string, options: { offset: number; count: number; signal: AbortSignal }): Promise<SearchPage>;
}

type Fetcher = typeof fetch;

async function readJson(response: Response, provider: string): Promise<unknown> {
  if (response.status === 401 || response.status === 403) throw new IngestError("http_error", `${provider} rejected the API key. Check the key in your environment.`, 502);
  if (response.status === 429) throw new IngestError("rate_limited", `${provider} rate limit reached. Try again in a minute.`, 429);
  if (!response.ok) throw new IngestError("http_error", `${provider} returned an error (HTTP ${response.status}).`, 502);
  try {
    return await response.json();
  } catch {
    throw new IngestError("http_error", `${provider} returned an unreadable response.`, 502);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function braveProvider(apiKey: string, fetcher: Fetcher = fetch): SearchProvider {
  return {
    id: "brave",
    label: "Brave Search",
    scope: "web",
    async search(query, { offset, count, signal }) {
      // Brave paginates by page index (0-9), each page `count` results long.
      const page = Math.floor(offset / count);
      if (page > 9) return { results: [], nextOffset: null };
      const params = new URLSearchParams({ q: query, count: String(count), offset: String(page), safesearch: "moderate", text_decorations: "false" });
      const response = await fetcher(`https://api.search.brave.com/res/v1/web/search?${params}`, {
        headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
        signal,
        cache: "no-store",
      });
      const body = asRecord(await readJson(response, "Brave Search"));
      const web = asRecord(body.web);
      const items = Array.isArray(web.results) ? web.results : [];
      const results: RawResult[] = items.map((item) => {
        const r = asRecord(item);
        return { title: str(r.title) ?? "", url: str(r.url) ?? "", snippet: str(r.description), publishedAt: str(r.page_age) };
      });
      const more = asRecord(body.query).more_results_available === true;
      return { results, nextOffset: more && page < 9 ? (page + 1) * count : null };
    },
  };
}

export function tavilyProvider(apiKey: string, fetcher: Fetcher = fetch): SearchProvider {
  return {
    id: "tavily",
    label: "Tavily",
    scope: "web",
    async search(query, { offset, count, signal }) {
      // Tavily has no offset parameter: ask for more results and skip the ones already shown.
      const max = Math.min(20, offset + count);
      if (offset >= 20) return { results: [], nextOffset: null };
      const response = await fetcher("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, max_results: max, search_depth: "basic", include_answer: false, include_raw_content: false, include_images: false }),
        signal,
        cache: "no-store",
      });
      const body = asRecord(await readJson(response, "Tavily"));
      const items = Array.isArray(body.results) ? body.results : [];
      const results: RawResult[] = items.slice(offset).map((item) => {
        const r = asRecord(item);
        return { title: str(r.title) ?? "", url: str(r.url) ?? "", snippet: str(r.content), publishedAt: str(r.published_date) };
      });
      return { results, nextOffset: items.length >= max && max < 20 ? max : null };
    },
  };
}

export function wikipediaProvider(fetcher: Fetcher = fetch, lang = "en"): SearchProvider {
  return {
    id: "wikipedia",
    label: "Wikipedia",
    scope: "encyclopedia",
    async search(query, { offset, count, signal }) {
      const params = new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: query,
        srlimit: String(count),
        sroffset: String(offset),
        srprop: "snippet",
        format: "json",
        formatversion: "2",
        utf8: "1",
      });
      const response = await fetcher(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
        headers: { Accept: "application/json", "User-Agent": "MindspaceDiscovery/0.1 (local research tool; https://www.mediawiki.org/wiki/API:Etiquette)" },
        signal,
        cache: "no-store",
      });
      const body = asRecord(await readJson(response, "Wikipedia"));
      const items = Array.isArray(asRecord(body.query).search) ? (asRecord(body.query).search as unknown[]) : [];
      // Wikipedia's timestamp is the last edit, not a publication date, so it is deliberately not used.
      const results: RawResult[] = items.map((item) => {
        const r = asRecord(item);
        const title = str(r.title) ?? "";
        return { title, url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, snippet: str(r.snippet) };
      });
      const next = asRecord(body.continue).sroffset;
      return { results, nextOffset: typeof next === "number" ? next : null };
    },
  };
}

export interface ProviderSet {
  web: SearchProvider | null;
  encyclopedia: SearchProvider | null;
}

/** Reads provider configuration from the environment on every call (no restart needed in dev). */
export function providersFromEnv(env: NodeJS.ProcessEnv = process.env, fetcher: Fetcher = fetch): ProviderSet {
  const brave = env.BRAVE_SEARCH_API_KEY?.trim();
  const tavily = env.TAVILY_API_KEY?.trim();
  const preferred = env.DISCOVERY_SEARCH_PROVIDER?.trim().toLowerCase();
  let web: SearchProvider | null = null;
  if (brave && tavily) web = preferred === "tavily" ? tavilyProvider(tavily, fetcher) : braveProvider(brave, fetcher);
  else if (brave) web = braveProvider(brave, fetcher);
  else if (tavily) web = tavilyProvider(tavily, fetcher);
  const encyclopedia = env.DISCOVERY_DISABLE_WIKIPEDIA === "1" ? null : wikipediaProvider(fetcher);
  return { web, encyclopedia };
}

export function publicConfig(env: NodeJS.ProcessEnv = process.env): DiscoveryConfig {
  const { web, encyclopedia } = providersFromEnv(env);
  return {
    web: web ? { id: web.id, label: web.label } : null,
    encyclopedia: encyclopedia ? { id: encyclopedia.id, label: encyclopedia.label } : null,
  };
}
