import type { IngestedArticle, IngestStage } from "@/types/research";
import { domainOf } from "@/lib/discovery/url";
import { errorForStatus, IngestError } from "./errors";
import { decodeBody, extractArticle, extractPlainText } from "./extract";
import { charsetOf, mediaType, safeFetch, validateTargetUrl, type NetworkPolicy, type Resolver } from "./net";
import { assertRobotsAllowed } from "./robots";

const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const MAX_PAGE_BYTES = 4 * 1024 * 1024;

export interface IngestOptions {
  signal?: AbortSignal;
  onStage?: (stage: IngestStage) => void;
  resolver?: Resolver;
  /** Defaults to the strict production policy (public addresses, ports 80/443). */
  policy?: NetworkPolicy;
  /** Tests can skip the robots.txt request. */
  skipRobots?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
}

/**
 * Fetches one public page and returns its readable text and metadata.
 * Every failure is an IngestError with a user-facing message.
 */
export async function ingestUrl(rawUrl: string, options: IngestOptions = {}): Promise<IngestedArticle> {
  const url = validateTargetUrl(rawUrl, options.policy);
  if (!options.skipRobots) {
    options.onStage?.("checking");
    await assertRobotsAllowed(url, { signal: options.signal, resolver: options.resolver, policy: options.policy });
  }
  options.onStage?.("fetching");
  const response = await safeFetch(url, {
    signal: options.signal,
    resolver: options.resolver,
    policy: options.policy,
    maxBytes: options.maxBytes ?? MAX_PAGE_BYTES,
    timeoutMs: options.timeoutMs ?? 15000,
  });
  if (response.status < 200 || response.status >= 300) throw errorForStatus(response.status);

  const type = mediaType(response.headers);
  options.onStage?.("extracting");
  const finalUrl = response.url;
  let extracted;
  if (HTML_TYPES.has(type) || (!type && /<html[\s>]/i.test(response.body.subarray(0, 2048).toString("latin1")))) {
    extracted = extractArticle(decodeBody(response.body, charsetOf(response.headers)), finalUrl);
  } else if (type === "text/plain") {
    extracted = extractPlainText(decodeBody(response.body, charsetOf(response.headers)), finalUrl);
  } else if (type === "application/pdf") {
    throw new IngestError("unsupported_type", "PDF documents can't be imported yet. Open the PDF and paste the relevant text manually.");
  } else {
    throw new IngestError("unsupported_type", `This kind of file (${type || "unknown type"}) can't be imported. Only web pages and plain text are supported.`);
  }

  return {
    requestedUrl: url.href,
    finalUrl,
    canonicalUrl: extracted.canonicalUrl,
    domain: domainOf(finalUrl),
    title: extracted.title,
    siteName: extracted.siteName,
    byline: extracted.byline,
    description: extracted.description,
    publishedAt: extracted.publishedAt,
    lang: extracted.lang,
    text: extracted.text,
    wordCount: extracted.wordCount,
    truncated: extracted.truncated,
    paywallHint: extracted.paywallHint,
    retrievedAt: Date.now(),
  };
}
