/**
 * Discovery (research) data model. Source and concept details live on graph nodes so
 * undo/redo, autosave and export treat them like any other edit; full article text is
 * kept out of the graph in a separate local content store.
 */

export type Workspace = "create" | "discovery";

export type SourceStatus = "pending" | "ready" | "failed";

/** How a source entered the workspace. */
export type SourceOrigin = "search" | "url" | "manual";

export type IngestErrorCode =
  | "invalid_url"
  | "blocked_url"
  | "dns_failed"
  | "timeout"
  | "too_large"
  | "unsupported_type"
  | "http_error"
  | "forbidden"
  | "paywalled"
  | "not_found"
  | "robots_disallowed"
  | "too_many_redirects"
  | "no_content"
  | "network"
  | "rate_limited"
  | "duplicate"
  | "cancelled"
  | "analysis_failed";

export interface SourceError {
  code: IngestErrorCode;
  message: string;
}

export interface SourceInfo {
  /** The address as added by the user or returned by search. */
  url: string;
  /** Normalised address used for duplicate detection. */
  key: string;
  canonicalUrl?: string;
  domain: string;
  title: string;
  siteName?: string;
  byline?: string;
  /** The page's own meta description. */
  description?: string;
  /** Snippet returned by the search provider (not article content). */
  snippet?: string;
  /** ISO date. Only set when the page metadata or search provider states it. */
  publishedAt?: string;
  publishedFrom?: "page" | "search";
  retrievedAt?: number;
  status: SourceStatus;
  error?: SourceError;
  origin: SourceOrigin;
  /** Search query that surfaced this source. */
  query?: string;
  summary?: string;
  /** "extractive" summaries are sentences quoted verbatim from the source. */
  summaryKind?: "extractive" | "model";
  /** Verbatim sentences that state an argument or claim. */
  keyPassages?: string[];
  contentHash?: string;
  /** Where the analysed text came from: fetched from the page, or pasted by the user. */
  textOrigin?: "fetched" | "pasted";
  wordCount?: number;
  truncated?: boolean;
  paywallHint?: boolean;
  /** Which analysis produced the concepts: deterministic local heuristics or a language model. */
  analysis?: "local" | "model";
}

export type ConceptType = "theme" | "concept" | "person" | "organization" | "place" | "event" | "date" | "entity";

export const CONCEPT_TYPES: readonly ConceptType[] = ["theme", "concept", "person", "organization", "place", "event", "date", "entity"];

export interface ConceptRef {
  sourceId: string;
  /** Verbatim passages from that source that mention the concept. */
  passages: string[];
  mentions: number;
  /** The source discusses this concept with contrasting or disputed language (heuristic). */
  tension?: boolean;
}

export interface ConceptInfo {
  type: ConceptType;
  description?: string;
  /** quote: a sentence from a source; model: written by a language model from source passages; user: written by you. */
  descriptionKind?: "quote" | "model" | "user";
  refs: ConceptRef[];
  /** Normalised label keys this concept answers to when merging new sources. */
  aliases: string[];
  review: "unreviewed" | "accepted";
}

export type EdgeReview = "unreviewed" | "accepted" | "hypothesis";

export interface Evidence {
  sourceId: string;
  text: string;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  key: string;
  domain: string;
  /** Provider-supplied snippet, never article content. */
  snippet: string;
  publishedAt?: string;
  provider: SearchProviderId;
  rank: number;
  /** File types Discovery cannot import (e.g. PDF). */
  unsupported?: string;
}

export type SearchProviderId = "brave" | "tavily" | "wikipedia";

export type SearchScope = "web" | "encyclopedia";

export interface SearchRun {
  query: string;
  scope: SearchScope;
  provider: SearchProviderId;
  results: SearchResult[];
  fetchedAt: number;
  /** Offset for "more results", or null when the provider has no more. */
  nextOffset: number | null;
}

export interface ResearchMeta {
  question: string;
  notes: string;
  search?: SearchRun;
  /** Preferred analysis provider for new imports. */
  analysis: "local" | "model";
}

export interface ProviderInfo {
  id: string;
  label: string;
}

/** What the server can do, as reported by /api/discovery/config. Never includes secrets. */
export interface DiscoveryConfig {
  web: ProviderInfo | null;
  encyclopedia: ProviderInfo | null;
}

/** Article data returned by the ingestion endpoint. */
export interface IngestedArticle {
  requestedUrl: string;
  finalUrl: string;
  canonicalUrl?: string;
  domain: string;
  title: string;
  siteName?: string;
  byline?: string;
  description?: string;
  publishedAt?: string;
  lang?: string;
  text: string;
  wordCount: number;
  truncated: boolean;
  paywallHint: boolean;
  retrievedAt: number;
}

export type IngestStage = "checking" | "fetching" | "extracting";
