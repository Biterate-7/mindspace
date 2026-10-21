import type { LinkData, Relation } from "@/types/graph";
import { ALL_RELATIONS } from "@/types/graph";
import type { ConceptInfo, ConceptRef, EdgeReview, IngestErrorCode, ResearchMeta, SearchProviderId, SearchResult, SearchRun, SourceInfo } from "@/types/research";
import { CONCEPT_TYPES } from "@/types/research";
import { domainOf, urlKey } from "./url";

/**
 * Validation for research data read back from storage or imported JSON. Anything
 * malformed is dropped or coerced to a safe default instead of throwing, so one bad
 * field never makes a whole workspace unreadable.
 */

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function strings(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => text(v, maxLength)).filter((v): v is string => Boolean(v)).slice(0, maxItems);
}

function compact<T extends object>(value: T): T {
  for (const key of Object.keys(value) as Array<keyof T>) if (value[key] === undefined) delete value[key];
  return value;
}

const ERROR_CODES = new Set<IngestErrorCode>([
  "invalid_url",
  "blocked_url",
  "dns_failed",
  "timeout",
  "too_large",
  "unsupported_type",
  "http_error",
  "forbidden",
  "paywalled",
  "not_found",
  "robots_disallowed",
  "too_many_redirects",
  "no_content",
  "network",
  "rate_limited",
  "duplicate",
  "cancelled",
  "analysis_failed",
]);

export function sanitizeSourceInfo(value: unknown): SourceInfo | undefined {
  if (!isRecord(value)) return undefined;
  const url = httpUrl(value.url);
  const manual = value.origin === "manual";
  if (!url && !manual) return undefined;
  const status = value.status === "ready" || value.status === "failed" ? value.status : "pending";
  const error = isRecord(value.error) && ERROR_CODES.has(value.error.code as IngestErrorCode) ? { code: value.error.code as IngestErrorCode, message: text(value.error.message, 400) ?? "Import failed." } : undefined;
  return compact<SourceInfo>({
    url: url ?? "",
    key: text(value.key, 2100) ?? (url ? urlKey(url) : ""),
    canonicalUrl: httpUrl(value.canonicalUrl),
    domain: text(value.domain, 253) ?? (url ? domainOf(url) : ""),
    title: text(value.title, 300) ?? (url ? domainOf(url) : "Pasted text"),
    siteName: text(value.siteName, 120),
    byline: text(value.byline, 160),
    description: text(value.description, 600),
    snippet: text(value.snippet, 600),
    publishedAt: text(value.publishedAt, 40),
    publishedFrom: value.publishedFrom === "page" || value.publishedFrom === "search" ? value.publishedFrom : undefined,
    retrievedAt: num(value.retrievedAt),
    status,
    error: status === "failed" ? error ?? { code: "network", message: "Import failed." } : undefined,
    origin: value.origin === "search" || value.origin === "manual" ? value.origin : "url",
    query: text(value.query, 400),
    summary: text(value.summary, 1200),
    summaryKind: value.summaryKind === "model" ? "model" : value.summaryKind === "extractive" ? "extractive" : undefined,
    keyPassages: strings(value.keyPassages, 8, 600),
    contentHash: text(value.contentHash, 80),
    textOrigin: value.textOrigin === "pasted" ? "pasted" : value.textOrigin === "fetched" ? "fetched" : undefined,
    wordCount: num(value.wordCount),
    truncated: value.truncated === true ? true : undefined,
    paywallHint: value.paywallHint === true ? true : undefined,
    analysis: value.analysis === "model" ? "model" : value.analysis === "local" ? "local" : undefined,
  });
}

function sanitizeRef(value: unknown): ConceptRef | null {
  if (!isRecord(value) || typeof value.sourceId !== "string") return null;
  return compact<ConceptRef>({
    sourceId: value.sourceId,
    passages: strings(value.passages, 4, 600),
    mentions: Math.max(0, Math.round(num(value.mentions) ?? 0)),
    tension: value.tension === true ? true : undefined,
  });
}

export function sanitizeConceptInfo(value: unknown): ConceptInfo | undefined {
  if (!isRecord(value)) return undefined;
  const refs = Array.isArray(value.refs) ? value.refs.map(sanitizeRef).filter((r): r is ConceptRef => r !== null).slice(0, 60) : [];
  return compact<ConceptInfo>({
    type: CONCEPT_TYPES.includes(value.type as ConceptInfo["type"]) ? (value.type as ConceptInfo["type"]) : "concept",
    description: text(value.description, 600),
    descriptionKind: value.descriptionKind === "quote" || value.descriptionKind === "model" || value.descriptionKind === "user" ? value.descriptionKind : undefined,
    refs,
    aliases: strings(value.aliases, 12, 200),
    review: value.review === "accepted" ? "accepted" : "unreviewed",
  });
}

const REVIEWS = new Set<EdgeReview>(["unreviewed", "accepted", "hypothesis"]);

/** Keeps only known link fields; unknown relations fall back to "related". */
export function sanitizeLinkData(value: unknown): LinkData {
  const data = isRecord(value) ? value : {};
  const relation: Relation = ALL_RELATIONS.includes(data.relation as Relation) ? (data.relation as Relation) : "related";
  const link: LinkData = { relation };
  if (REVIEWS.has(data.review as EdgeReview)) link.review = data.review as EdgeReview;
  const rationale = text(data.rationale, 1000);
  if (rationale) link.rationale = rationale;
  if (isRecord(data.evidence) && typeof data.evidence.sourceId === "string") {
    const evidence = text(data.evidence.text, 600);
    if (evidence) link.evidence = { sourceId: data.evidence.sourceId, text: evidence };
  }
  if (data.auto === true) link.auto = true;
  return link;
}

const PROVIDERS = new Set<SearchProviderId>(["brave", "tavily", "wikipedia"]);

function sanitizeResult(value: unknown): SearchResult | null {
  if (!isRecord(value)) return null;
  const url = httpUrl(value.url);
  const title = text(value.title, 300);
  if (!url || !title || !PROVIDERS.has(value.provider as SearchProviderId)) return null;
  return compact<SearchResult>({
    id: text(value.id, 40) ?? urlKey(url),
    title,
    url,
    key: text(value.key, 2100) ?? urlKey(url),
    domain: text(value.domain, 253) ?? domainOf(url),
    snippet: text(value.snippet, 600) ?? "",
    publishedAt: text(value.publishedAt, 40),
    provider: value.provider as SearchProviderId,
    rank: Math.max(0, Math.round(num(value.rank) ?? 0)),
    unsupported: text(value.unsupported, 12),
  });
}

function sanitizeSearch(value: unknown): SearchRun | undefined {
  if (!isRecord(value) || !PROVIDERS.has(value.provider as SearchProviderId)) return undefined;
  const results = Array.isArray(value.results) ? value.results.map(sanitizeResult).filter((r): r is SearchResult => r !== null).slice(0, 120) : [];
  const next = num(value.nextOffset);
  return {
    query: text(value.query, 400) ?? "",
    scope: value.scope === "encyclopedia" ? "encyclopedia" : "web",
    provider: value.provider as SearchProviderId,
    results,
    fetchedAt: num(value.fetchedAt) ?? 0,
    nextOffset: next !== undefined && next >= 0 ? next : null,
  };
}

export function sanitizeResearchMeta(value: unknown): ResearchMeta {
  const data = isRecord(value) ? value : {};
  return compact<ResearchMeta>({
    question: text(data.question, 500) ?? "",
    notes: typeof data.notes === "string" ? data.notes.slice(0, 20000) : "",
    search: sanitizeSearch(data.search),
    analysis: data.analysis === "model" ? "model" : "local",
  });
}
