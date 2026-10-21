import type { SearchProviderId, SearchResult } from "@/types/research";
import { contentWords, stem } from "@/lib/generation/text";
import { hashString } from "@/lib/utils/random";
import { domainOf, parseHttpUrl, unsupportedFormat, urlKey } from "./url";

/** A result as returned by a provider, before normalisation. */
export interface RawResult {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", hellip: "…", mdash: "—", ndash: "–" };

/** Strips markup from provider snippets (they often contain <strong> highlights) and decodes entities. */
export function plainSnippet(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      const lower = entity.toLowerCase();
      if (ENTITIES[lower]) return ENTITIES[lower];
      if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16) || 32);
      if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1)) || 32);
      return match;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function normTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Normalises, deduplicates and ranks provider results. Results are never invented or
 * rewritten: titles and snippets are the provider's, only cleaned of markup.
 *
 * Ranking keeps the provider's order as the main signal, nudged by how many question
 * terms appear in the title/snippet, and demotes a third+ result from the same domain
 * so the first page stays diverse.
 */
export function rankResults(raw: readonly RawResult[], query: string, provider: SearchProviderId, startRank = 0, exclude: ReadonlySet<string> = new Set()): SearchResult[] {
  const queryStems = new Set(contentWords(query).map(stem));
  const seenKeys = new Set(exclude);
  const seenTitles = new Set<string>();
  const candidates: Array<SearchResult & { score: number }> = [];

  raw.forEach((item, index) => {
    const url = parseHttpUrl(item.url ?? "");
    const title = plainSnippet(item.title ?? "").slice(0, 300);
    if (!url || !title) return;
    const key = urlKey(url);
    const domain = domainOf(url);
    const titleKey = `${domain}|${normTitle(title)}`;
    if (seenKeys.has(key) || seenTitles.has(titleKey)) return;
    seenKeys.add(key);
    seenTitles.add(titleKey);
    const snippet = plainSnippet(item.snippet ?? "").slice(0, 600);
    const words = new Set(contentWords(`${title} ${snippet}`).map(stem));
    let overlap = 0;
    for (const s of queryStems) if (words.has(s)) overlap++;
    const relevance = queryStems.size ? overlap / queryStems.size : 0;
    const date = item.publishedAt && Number.isFinite(Date.parse(item.publishedAt)) ? item.publishedAt : undefined;
    candidates.push({
      id: `r_${hashString(key).toString(36)}`,
      title,
      url: url.href,
      key,
      domain,
      snippet,
      publishedAt: date,
      provider,
      rank: startRank + index,
      unsupported: unsupportedFormat(url.href),
      score: index - relevance * 2.5,
    });
  });

  const perDomain = new Map<string, number>();
  for (const c of [...candidates].sort((a, b) => a.score - b.score)) {
    const count = (perDomain.get(c.domain) ?? 0) + 1;
    perDomain.set(c.domain, count);
    if (count > 2) c.score += 6 * (count - 2);
    if (c.unsupported) c.score += 4;
  }
  return candidates
    .sort((a, b) => a.score - b.score || a.rank - b.rank)
    .map((candidate, i) => {
      const result: SearchResult = { ...candidate, rank: startRank + i };
      delete (result as Partial<typeof candidate>).score;
      return result;
    });
}
