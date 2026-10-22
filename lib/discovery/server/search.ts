import type { DiscoveryConfig, ProviderKind, SearchProviderId } from "@/types/research";
import type { RawResult } from "@/lib/discovery/rank";
import { asRecord, type Fetcher, readJson, str, USER_AGENT, type SearchProvider } from "./providers/common";
import { federalRegisterProvider, worldBankProvider } from "./providers/government";
import { gdeltProvider } from "./providers/news";
import { arxivProvider, europePmcProvider, openAlexProvider } from "./providers/scholarly";
import { gitHubProvider, hackerNewsProvider, stackExchangeProvider } from "./providers/technical";

export type { SearchPage, SearchProvider } from "./providers/common";

/**
 * Search provider registry. Providers run only on the server, so API keys never reach the
 * browser. Discovery asks several independent indexes at once (see federated.ts) instead
 * of one engine, so no single source — Wikipedia included — can dominate a workspace.
 *
 * Keyless, always available (each can be turned off with DISCOVERY_DISABLE_PROVIDERS):
 *   openalex, arxiv, europepmc  scholarly literature
 *   gdelt                       worldwide news
 *   hackernews, github, stackexchange  technical sources
 *   federalregister, worldbank  government and intergovernmental documents
 *   wikipedia                   reference (DISCOVERY_DISABLE_WIKIPEDIA=1 also turns it off)
 *
 * Keyed general web search, the broadest coverage:
 *   BRAVE_SEARCH_API_KEY  → Brave Search API
 *   TAVILY_API_KEY        → Tavily Search API
 *   DISCOVERY_SEARCH_PROVIDER=brave|tavily picks one when both keys are set.
 *
 * Optional keys that raise keyless quotas: OPENALEX_API_KEY, GITHUB_TOKEN, STACKEXCHANGE_KEY.
 * DISCOVERY_CONTACT_EMAIL is sent to OpenAlex as `mailto` (its "polite pool").
 */

export function braveProvider(apiKey: string, fetcher: Fetcher = fetch): SearchProvider {
  return {
    id: "brave",
    label: "Brave Search",
    scope: "web",
    kind: "web",
    keyless: false,
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
    kind: "web",
    keyless: false,
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
    kind: "encyclopedia",
    keyless: true,
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
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal,
        cache: "no-store",
      });
      const body = asRecord(await readJson(response, "Wikipedia", false));
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
  /** General web search (keyed), or null. */
  web: SearchProvider | null;
  encyclopedia: SearchProvider | null;
  /** Every enabled provider, in the order results are attributed: web, scholarly, news, technical, government, reference. */
  all: SearchProvider[];
}

const KIND_ORDER: readonly ProviderKind[] = ["web", "scholarly", "news", "technical", "government", "encyclopedia"];

/** Reads provider configuration from the environment on every call (no restart needed in dev). */
export function providersFromEnv(env: NodeJS.ProcessEnv = process.env, fetcher: Fetcher = fetch): ProviderSet {
  const brave = env.BRAVE_SEARCH_API_KEY?.trim();
  const tavily = env.TAVILY_API_KEY?.trim();
  const preferred = env.DISCOVERY_SEARCH_PROVIDER?.trim().toLowerCase();
  let web: SearchProvider | null = null;
  if (brave && tavily) web = preferred === "tavily" ? tavilyProvider(tavily, fetcher) : braveProvider(brave, fetcher);
  else if (brave) web = braveProvider(brave, fetcher);
  else if (tavily) web = tavilyProvider(tavily, fetcher);

  const disabled = new Set((env.DISCOVERY_DISABLE_PROVIDERS ?? "").split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean) as SearchProviderId[]);
  if (env.DISCOVERY_DISABLE_WIKIPEDIA === "1") disabled.add("wikipedia");
  const encyclopedia = disabled.has("wikipedia") ? null : wikipediaProvider(fetcher);
  const keyless: SearchProvider[] = [
    openAlexProvider(fetcher, { apiKey: env.OPENALEX_API_KEY?.trim() || undefined, mailto: env.DISCOVERY_CONTACT_EMAIL?.trim() || undefined }),
    arxivProvider(fetcher),
    europePmcProvider(fetcher),
    gdeltProvider(fetcher),
    hackerNewsProvider(fetcher),
    gitHubProvider(fetcher, env.GITHUB_TOKEN?.trim() || undefined),
    stackExchangeProvider(fetcher, env.STACKEXCHANGE_KEY?.trim() || undefined),
    federalRegisterProvider(fetcher),
    worldBankProvider(fetcher),
  ].filter((p) => !disabled.has(p.id));
  const all = [...(web ? [web] : []), ...keyless, ...(encyclopedia ? [encyclopedia] : [])].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return { web, encyclopedia, all };
}

export function publicConfig(env: NodeJS.ProcessEnv = process.env): DiscoveryConfig {
  const { web, encyclopedia, all } = providersFromEnv(env);
  return {
    web: web ? { id: web.id, label: web.label } : null,
    encyclopedia: encyclopedia ? { id: encyclopedia.id, label: encyclopedia.label } : null,
    providers: all.map((p) => ({ id: p.id, label: p.label, kind: p.kind, keyless: p.keyless })),
  };
}
