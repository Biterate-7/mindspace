import type { Relation } from "@/types/graph";
import type { EdgeReview, IngestErrorCode, SearchProviderId } from "@/types/research";
import type { JobStage } from "@/lib/store/types";

/** Shared user-facing wording for Discovery. */

export const PROVIDER_LABELS: Record<SearchProviderId, string> = {
  brave: "Brave Search",
  tavily: "Tavily",
  wikipedia: "Wikipedia",
  openalex: "OpenAlex",
  arxiv: "arXiv",
  europepmc: "Europe PMC",
  gdelt: "GDELT news",
  hackernews: "Hacker News",
  github: "GitHub",
  stackexchange: "Stack Overflow",
  federalregister: "Federal Register",
  worldbank: "World Bank",
};

export const RELATION_HINTS: Record<Relation, string> = {
  related: "A general association between the two ideas.",
  causes: "One idea leads to or produces the other.",
  supports: "One idea enables or strengthens the other.",
  example: "One idea is a concrete instance of the other.",
  contrasts: "The ideas pull in different directions.",
  contradicts: "The two claims cannot both be true as stated.",
  mentions: "The concept appears in this source.",
  extracted: "Found first in this source (concepts) or quoted from it (claims).",
  evidence: "This quoted claim mentions the concept — evidence about it from its source.",
  believes: "Your own asserted link — record why you think it holds.",
};

export const REVIEW_LABELS: Record<EdgeReview, string> = {
  unreviewed: "Suggested · unreviewed",
  accepted: "Reviewed",
  hypothesis: "Hypothesis",
};

export const REVIEW_HINTS: Record<EdgeReview, string> = {
  unreviewed: "Proposed automatically from shared sentences or matching words. Not verified.",
  accepted: "You checked this link and keep it.",
  hypothesis: "You think this might hold but have not confirmed it.",
};

export const STAGE_LABELS: Record<JobStage, string> = {
  queued: "Queued",
  checking: "Checking robots.txt",
  fetching: "Fetching page",
  extracting: "Extracting text",
  reading: "Reading stored text",
  analyzing: "Extracting concepts",
};

/** Short labels for failure badges. */
export const ERROR_LABELS: Record<IngestErrorCode, string> = {
  invalid_url: "Invalid address",
  blocked_url: "Blocked address",
  dns_failed: "Site not found",
  timeout: "Timed out",
  too_large: "Too large",
  unsupported_type: "Unsupported file",
  http_error: "Site error",
  forbidden: "Access refused",
  paywalled: "Paywalled",
  not_found: "Not found",
  robots_disallowed: "Blocked by robots.txt",
  too_many_redirects: "Redirect loop",
  no_content: "No readable text",
  network: "Network error",
  rate_limited: "Rate limited",
  duplicate: "Duplicate",
  cancelled: "Cancelled",
  analysis_failed: "Nothing to analyse",
};

export const EXAMPLE_QUESTIONS = [
  "Why did the Treaty of Versailles contribute to World War II?",
  "How is artificial intelligence changing scientific research?",
  "What causes climate tipping points?",
  "How do successful startups find product-market fit?",
];

export function formatDate(value: string | number | undefined): string | null {
  if (value === undefined || value === "") return null;
  const time = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(time)) return null;
  // Date-only strings are shown without shifting them into the local time zone.
  const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Date(time).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", ...(dateOnly ? { timeZone: "UTC" } : {}) });
}
