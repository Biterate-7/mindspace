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
  /**
   * Where the analysed text came from: fetched from the page, pasted by the user, or the
   * abstract a scholarly index returned (used only when the page itself could not be read).
   */
  textOrigin?: "fetched" | "pasted" | "abstract";
  /** Why the full page could not be read when only the abstract was analysed. */
  accessError?: SourceError;
  wordCount?: number;
  truncated?: boolean;
  paywallHint?: boolean;
  /** Which analysis produced the concepts: deterministic local heuristics or a language model. */
  analysis?: "local" | "model";
  /** What kind of publisher this is (heuristic, from the provider and the address). */
  category?: SourceCategory;
  /** Primary evidence, secondary analysis, reference material or opinion (heuristic). */
  sourceRole?: SourceRole;
  /** Authors as listed by a scholarly index or the page. */
  authors?: string[];
  /** Journal, repository or publication the provider names. */
  venue?: string;
  doi?: string;
  /** Search providers that returned this source. */
  providers?: SearchProviderId[];
  /** Abstract supplied by a scholarly index (not fetched from the page). */
  abstract?: string;
  abstractFrom?: SearchProviderId;
  citedBy?: number;
  /** An arXiv-style preprint: not peer reviewed. */
  preprint?: boolean;
  /** Other identities of the same work (DOI, arXiv id, canonical address) used to prevent duplicates. */
  altKeys?: string[];
  /** Plain-language quality notes from ranking ("peer-reviewed journal", "opinion section"…). */
  signals?: string[];
}

/** What kind of publisher a source is. Heuristic; shown as a label, never as a verdict. */
export type SourceCategory = "academic" | "news" | "reference" | "government" | "documentation" | "code" | "discussion" | "educational" | "organization" | "blog" | "web";

export const SOURCE_CATEGORIES: readonly SourceCategory[] = ["academic", "news", "reference", "government", "documentation", "code", "discussion", "educational", "organization", "blog", "web"];

/** How a source relates to the claims it carries. */
export type SourceRole = "primary" | "secondary" | "reference" | "opinion";

export const SOURCE_ROLES: readonly SourceRole[] = ["primary", "secondary", "reference", "opinion"];

/** A verbatim sentence from one or more sources that states a claim about mapped concepts. */
export interface ClaimInfo {
  text: string;
  sourceIds: string[];
  review: "unreviewed" | "accepted";
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
  /** Every provider that returned this result (the first is `provider`). */
  providers?: SearchProviderId[];
  category?: SourceCategory;
  sourceRole?: SourceRole;
  authors?: string[];
  venue?: string;
  /** Publisher or host organisation named by the index. */
  publisher?: string;
  doi?: string;
  /** Abstract supplied by a scholarly index — labelled as such, never presented as the page. */
  abstract?: string;
  citedBy?: number;
  preprint?: boolean;
  altKeys?: string[];
  signals?: string[];
  /** The generated query that surfaced it. */
  query?: string;
}

export type SearchProviderId =
  | "brave"
  | "tavily"
  | "wikipedia"
  | "openalex"
  | "arxiv"
  | "europepmc"
  | "gdelt"
  | "hackernews"
  | "github"
  | "stackexchange"
  | "federalregister"
  | "worldbank";

export const SEARCH_PROVIDER_IDS: readonly SearchProviderId[] = ["brave", "tavily", "wikipedia", "openalex", "arxiv", "europepmc", "gdelt", "hackernews", "github", "stackexchange", "federalregister", "worldbank"];

/** What a provider indexes. Used to choose providers per topic. */
export type ProviderKind = "web" | "encyclopedia" | "scholarly" | "news" | "technical" | "government";

export type ProviderStatusCode = "ok" | "empty" | "failed" | "timeout" | "rate_limited" | "skipped";

/** What happened when one provider was asked, reported honestly to the user. */
export interface ProviderOutcome {
  id: SearchProviderId;
  label: string;
  status: ProviderStatusCode;
  /** Results this provider returned before deduplication. */
  count: number;
  message?: string;
  queries: string[];
}

export type SearchScope = "web" | "encyclopedia";

export interface SearchRun {
  query: string;
  scope: SearchScope;
  /** "multi" for a federated search across several providers. */
  provider: SearchProviderId | "multi";
  results: SearchResult[];
  fetchedAt: number;
  /** Offset for "more results", or null when the provider has no more. */
  nextOffset: number | null;
  /** Federated runs: per-provider outcome, generated queries and detected topic facets. */
  outcomes?: ProviderOutcome[];
  queries?: string[];
  facets?: string[];
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

export interface ProviderDescriptor extends ProviderInfo {
  kind: ProviderKind;
  /** Works without an API key. */
  keyless: boolean;
}

/** What the server can do, as reported by /api/discovery/config. Never includes secrets. */
export interface DiscoveryConfig {
  /** General web search (needs a key), or null. */
  web: ProviderInfo | null;
  encyclopedia: ProviderInfo | null;
  /** Every enabled provider, keyless or keyed. */
  providers: ProviderDescriptor[];
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
