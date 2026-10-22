import type { RawResult } from "@/lib/discovery/rank";
import { asArray, asRecord, compactNumber, type Fetcher, fromEpochSeconds, num, readJson, str, USER_AGENT, type SearchProvider } from "./common";

/**
 * Technical sources for software and technology questions:
 *
 *   Hacker News (Algolia) — links to the engineering blogs, docs and articles people discuss
 *   GitHub                — repositories (keyless: 10 searches/min; GITHUB_TOKEN raises it)
 *   Stack Exchange        — Stack Overflow questions (keyless: 300/day; STACKEXCHANGE_KEY raises it)
 */

export function hackerNewsProvider(fetcher: Fetcher = fetch): SearchProvider {
  return {
    id: "hackernews",
    label: "Hacker News",
    scope: "web",
    kind: "technical",
    keyless: true,
    async search(query, { offset, count, signal }) {
      const page = Math.floor(offset / count);
      if (page > 4) return { results: [], nextOffset: null };
      // Match titles only: post bodies mention everything and pull in unrelated "Show HN" posts.
      const params = new URLSearchParams({ query, tags: "story", hitsPerPage: String(count), page: String(page), numericFilters: "points>=5", restrictSearchableAttributes: "title" });
      const response = await fetcher(`https://hn.algolia.com/api/v1/search?${params}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal, cache: "no-store" });
      const body = asRecord(await readJson(response, "Hacker News", false));
      const results: RawResult[] = asArray(body.hits).map((item) => {
        const r = asRecord(item);
        const points = num(r.points);
        // The linked article is the source; text-only posts link to the discussion itself.
        const url = str(r.url) ?? `https://news.ycombinator.com/item?id=${str(r.objectID) ?? ""}`;
        return {
          title: str(r.title) ?? "",
          url,
          seenAt: str(r.created_at),
          hints: points ? [`${compactNumber(points)} points on Hacker News`] : undefined,
        };
      });
      const pages = num(body.nbPages) ?? 0;
      return { results, nextOffset: page + 1 < pages && page < 4 ? (page + 1) * count : null };
    },
  };
}

export function gitHubProvider(fetcher: Fetcher = fetch, token?: string): SearchProvider {
  return {
    id: "github",
    label: "GitHub",
    scope: "web",
    kind: "technical",
    keyless: true,
    async search(query, { offset, count, signal }) {
      const page = Math.floor(offset / count) + 1;
      if (page > 3) return { results: [], nextOffset: null };
      const params = new URLSearchParams({ q: `${query} stars:>=10`, per_page: String(count), page: String(page) });
      const headers: Record<string, string> = { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT, "X-GitHub-Api-Version": "2022-11-28" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetcher(`https://api.github.com/search/repositories?${params}`, { headers, signal, cache: "no-store" });
      const body = asRecord(await readJson(response, "GitHub", Boolean(token)));
      const results: RawResult[] = asArray(body.items).map((item) => {
        const r = asRecord(item);
        const stars = num(r.stargazers_count);
        const language = str(r.language);
        return {
          title: str(r.full_name) ?? "",
          url: str(r.html_url) ?? "",
          snippet: str(r.description),
          seenAt: str(r.pushed_at),
          hints: [stars !== undefined ? `${compactNumber(stars)} GitHub stars` : "", language ? `Written in ${language}` : ""].filter(Boolean),
        };
      });
      const total = num(body.total_count) ?? 0;
      return { results, nextOffset: total > page * count && page < 3 ? page * count : null };
    },
  };
}

export function stackExchangeProvider(fetcher: Fetcher = fetch, key?: string): SearchProvider {
  return {
    id: "stackexchange",
    label: "Stack Overflow",
    scope: "web",
    kind: "technical",
    keyless: true,
    async search(query, { offset, count, signal }) {
      const page = Math.floor(offset / count) + 1;
      if (page > 3) return { results: [], nextOffset: null };
      const params = new URLSearchParams({ q: query, site: "stackoverflow", order: "desc", sort: "relevance", pagesize: String(count), page: String(page), filter: "default" });
      if (key) params.set("key", key);
      const response = await fetcher(`https://api.stackexchange.com/2.3/search/advanced?${params}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal, cache: "no-store" });
      const body = asRecord(await readJson(response, "Stack Exchange", Boolean(key)));
      const results: RawResult[] = [];
      for (const item of asArray(body.items)) {
        const r = asRecord(item);
        const score = num(r.score) ?? 0;
        // Unanswered, negatively scored questions add noise rather than knowledge.
        if (r.is_answered !== true && score < 1) continue;
        const tags = asArray(r.tags).filter((t): t is string => typeof t === "string");
        results.push({
          title: str(r.title) ?? "",
          url: str(r.link) ?? "",
          snippet: tags.length ? `Tagged ${tags.slice(0, 5).join(", ")}` : undefined,
          publishedAt: fromEpochSeconds(r.creation_date),
          hints: [r.accepted_answer_id ? "Has an accepted answer" : "", `Score ${score}`].filter(Boolean),
        });
      }
      return { results, nextOffset: body.has_more === true && page < 3 ? page * count : null };
    },
  };
}
