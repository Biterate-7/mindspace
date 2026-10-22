import type { RawResult } from "@/lib/discovery/rank";
import { IngestError } from "../errors";
import { asArray, asRecord, type Fetcher, str, Throttle, USER_AGENT, type SearchProvider } from "./common";

/**
 * GDELT DOC 2.0 — a keyless index of worldwide online news (rolling three months), used
 * for current-events questions. GDELT asks for at most one request every five seconds.
 */

const GDELT_THROTTLE = new Throttle(5500);

/** GDELT reports "seen" times as 20261020T123000Z; that is crawl time, not publication time. */
export function gdeltTime(value: string | undefined): string | undefined {
  const m = value?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : undefined;
}

export function gdeltProvider(fetcher: Fetcher = fetch, throttle: Throttle = GDELT_THROTTLE): SearchProvider {
  return {
    id: "gdelt",
    label: "GDELT news",
    scope: "web",
    kind: "news",
    keyless: true,
    // GDELT is slow to answer and asks for 5 s between calls; give it room without blocking the others.
    timeoutMs: 18_000,
    async search(query, { offset, count, signal }) {
      // GDELT has no paging; it returns up to 250 articles, so take a window of them.
      if (offset >= 75) return { results: [], nextOffset: null };
      const words = query
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3)
        .slice(0, 5);
      if (words.length === 0) return { results: [], nextOffset: null };
      const max = Math.min(75, offset + count);
      const params = new URLSearchParams({ query: `${words.join(" ")} sourcelang:english`, mode: "artlist", format: "json", maxrecords: String(max), sort: "hybridrel", timespan: "3months" });
      await throttle.wait(signal);
      const response = await fetcher(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal, cache: "no-store" });
      const text = await response.text();
      // GDELT answers limits and query problems with plain text, sometimes with HTTP 200.
      if (response.status === 429 || /limit requests to one every/i.test(text)) throw new IngestError("rate_limited", "GDELT is rate-limiting this server (one request every 5 seconds). Try again shortly.", 429);
      if (!response.ok) throw new IngestError("http_error", `GDELT returned an error (HTTP ${response.status}).`, 502);
      let body: Record<string, unknown>;
      try {
        body = asRecord(JSON.parse(text));
      } catch {
        // A plain-text answer to a valid request means GDELT found nothing it could search for.
        return { results: [], nextOffset: null };
      }
      const items = asArray(body.articles);
      const results: RawResult[] = items.slice(offset).map((item) => {
        const r = asRecord(item);
        return { title: str(r.title) ?? "", url: str(r.url) ?? "", seenAt: gdeltTime(str(r.seendate)) };
      });
      return { results, nextOffset: items.length >= max && max < 75 ? max : null };
    },
  };
}
