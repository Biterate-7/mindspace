import type { IngestErrorCode, SearchResult, SourceError, SourceInfo } from "@/types/research";
import { unsupportedFormat, urlKey } from "./url";

/**
 * Rules for turning search results into sources: what metadata carries over, when an
 * index-supplied abstract may stand in for a page that cannot be read, and which results
 * an automatic research run imports.
 */

/** Abstracts shorter than this are too thin to analyse on their own. */
const MIN_ABSTRACT_CHARS = 200;

/** Failures where the page exists but cannot be read here, so a supplied abstract is the honest fallback. */
export const ABSTRACT_FALLBACK: ReadonlySet<IngestErrorCode> = new Set(["forbidden", "paywalled", "robots_disallowed", "unsupported_type", "timeout", "http_error", "no_content", "network", "rate_limited", "too_large", "too_many_redirects"]);

export function hasUsableAbstract(item: { abstract?: string }): boolean {
  return (item.abstract?.length ?? 0) >= MIN_ABSTRACT_CHARS;
}

/** True when the page could not be read but the source carries an abstract from a scholarly index. */
export function canUseAbstract(source: SourceInfo, error: SourceError | undefined): boolean {
  return Boolean(error && ABSTRACT_FALLBACK.has(error.code) && hasUsableAbstract(source) && source.origin === "search");
}

/** A PDF or other unreadable file whose abstract is all Discovery can analyse. */
export function abstractOnly(source: SourceInfo): boolean {
  return Boolean(unsupportedFormat(source.url)) && hasUsableAbstract(source);
}

/** Every key a source answers to, for duplicate detection across reruns. */
export function sourceKeys(source: SourceInfo): string[] {
  return [source.key, source.canonicalUrl ? urlKey(source.canonicalUrl) : "", ...(source.altKeys ?? [])].filter(Boolean);
}

export function resultKeys(result: SearchResult): string[] {
  return [result.key, ...(result.altKeys ?? [])];
}

export function isImported(result: SearchResult, keys: ReadonlySet<string>): boolean {
  return resultKeys(result).some((k) => keys.has(k));
}

/** Results that can become sources: readable pages, or unreadable files with an abstract. */
export function isImportable(result: SearchResult, keys: ReadonlySet<string>): boolean {
  return !isImported(result, keys) && (!result.unsupported || hasUsableAbstract(result));
}

/** Source metadata from a search result — only what the providers reported. */
export function sourceFromResult(result: SearchResult, query: string): SourceInfo {
  const info: SourceInfo = {
    url: result.url,
    key: result.key,
    domain: result.domain,
    title: result.title,
    snippet: result.snippet || undefined,
    publishedAt: result.publishedAt,
    publishedFrom: result.publishedAt ? "search" : undefined,
    status: "pending",
    origin: "search",
    query,
    category: result.category,
    sourceRole: result.sourceRole,
    authors: result.authors,
    venue: result.venue,
    // The resolver address says nothing about who published a DOI link; the index does.
    siteName: result.domain === "doi.org" || result.domain === "dx.doi.org" ? result.publisher : undefined,
    doi: result.doi,
    providers: result.providers ?? [result.provider],
    abstract: result.abstract,
    abstractFrom: result.abstract ? (result.providers ?? [result.provider]).find((p) => p === "openalex" || p === "arxiv" || p === "europepmc" || p === "worldbank") : undefined,
    citedBy: result.citedBy,
    preprint: result.preprint,
    altKeys: result.altKeys,
    signals: result.signals,
  };
  for (const key of Object.keys(info) as Array<keyof SourceInfo>) if (info[key] === undefined) delete info[key];
  return info;
}

/**
 * The results an automatic run imports: the best-ranked importable ones, one per domain,
 * so the first map already draws on several independent publishers.
 */
export function pickTopResults(results: readonly SearchResult[], keys: ReadonlySet<string>, count: number): SearchResult[] {
  const picked: SearchResult[] = [];
  const domains = new Set<string>();
  for (const result of results) {
    if (picked.length >= count) break;
    if (!isImportable(result, keys) || domains.has(result.domain)) continue;
    domains.add(result.domain);
    picked.push(result);
  }
  return picked;
}
