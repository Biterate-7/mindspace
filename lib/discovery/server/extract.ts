import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { IngestError } from "./errors";

/**
 * Readable-text extraction. Source HTML is parsed into an inert DOM on the server
 * (scripts never run, nothing is rendered), boilerplate is stripped, and Mozilla
 * Readability picks the main content. Only plain text and metadata leave this module.
 */

export const MAX_TEXT_CHARS = 60000;
const MIN_TEXT_CHARS = 280;

export interface ExtractedArticle {
  title: string;
  siteName?: string;
  byline?: string;
  description?: string;
  canonicalUrl?: string;
  publishedAt?: string;
  lang?: string;
  text: string;
  wordCount: number;
  truncated: boolean;
  paywallHint: boolean;
}

type Doc = ReturnType<typeof parseHTML>["document"];
type El = ReturnType<Doc["createElement"]>;

const STRIP_SELECTORS = [
  "script:not([type='application/ld+json'])",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "svg",
  "canvas",
  "video",
  "audio",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "nav",
  "footer",
  "aside",
  "dialog",
  "[role='navigation']",
  "[role='contentinfo']",
  "[role='complementary']",
  "[role='dialog']",
  "[role='alertdialog']",
  "[aria-modal='true']",
  "[hidden]",
  "figure",
  "table.infobox",
  ".infobox",
  ".vertical-navbox",
  ".metadata",
  ".ambox",
  ".mw-editsection",
  ".mw-references-wrap",
  ".reference",
  ".reflist",
  ".navbox",
  ".hatnote",
  ".toc",
  "#toc",
  ".thumb",
  "sup.noprint",
];

/** Class/id tokens that mark cookie banners, ads, share bars and similar clutter. */
const CLUTTER_TOKEN = /^(cookies?|consent|gdpr|ccpa|newsletter|subscribe|subscription|signup|paywall|advert|advertisement|ads?|adslot|sponsor(ed)?|promo|promotion|share|sharing|social|related|recommended|comments?|popup|modal|overlay|banner|breadcrumbs?|outbrain|taboola|toolbar|skip|sidebar|widget|footer|masthead|menu)$/i;

const PROTECTED_TAGS = new Set(["HTML", "BODY", "MAIN", "ARTICLE"]);

function meta(document: Doc, selectors: string[]): string | undefined {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const value = el?.getAttribute("content") ?? el?.getAttribute("datetime") ?? el?.getAttribute("href");
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

export function cleanText(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\[(?:\d+|[a-z]|citation needed|note \d+|[a-z] \d+|edit)\]/gi, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function textOf(el: { textContent: string | null } | null | undefined): string {
  return cleanText(el?.textContent ?? "").replace(/\s+/g, " ");
}

/** A date is only accepted when it parses and is not in the future. */
export function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/\d{4}/.test(trimmed)) return undefined;
  const time = Date.parse(trimmed);
  if (!Number.isFinite(time)) return undefined;
  const year = new Date(time).getUTCFullYear();
  if (year < 1000 || time > Date.now() + 36 * 3600 * 1000) return undefined;
  // Keep date-only values as dates so no time zone is invented.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  return new Date(time).toISOString();
}

interface JsonLdFacts {
  datePublished?: string;
  headline?: string;
  locked: boolean;
}

function readJsonLd(document: Doc): JsonLdFacts {
  const facts: JsonLdFacts = { locked: false };
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.datePublished === "string" && !facts.datePublished) facts.datePublished = record.datePublished;
    if (typeof record.headline === "string" && !facts.headline) facts.headline = record.headline;
    const free = record.isAccessibleForFree;
    if (free === false || (typeof free === "string" && free.toLowerCase() === "false")) facts.locked = true;
    for (const key of ["@graph", "mainEntity", "hasPart"]) visit(record[key], depth + 1);
  };
  for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
    try {
      visit(JSON.parse(script.textContent ?? ""), 0);
    } catch {
      // Malformed structured data is common; ignore it.
    }
  }
  return facts;
}

function httpUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function stripClutter(document: Doc): void {
  for (const selector of STRIP_SELECTORS) {
    for (const el of [...document.querySelectorAll(selector)]) el.remove();
  }
  const pageLength = document.body?.textContent?.length ?? 0;
  for (const el of [...document.querySelectorAll("[class], [id]")]) {
    if (PROTECTED_TAGS.has(el.tagName) || !el.isConnected) continue;
    const tokens = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`.split(/[\s_-]+/).filter(Boolean);
    if (!tokens.some((t) => CLUTTER_TOKEN.test(t))) continue;
    // Never strip a container holding most of the page (e.g. an article with class "comments-enabled").
    const length = el.textContent?.length ?? 0;
    if (el.querySelector("article, main") || (length > 1500 && length > pageLength * 0.35)) continue;
    el.remove();
  }
}

const BLOCKS = "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre";
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

/** Plain paragraphs from an element, one block per paragraph, in document order. */
function blocksOf(root: El): string[] {
  const out: string[] = [];
  for (const el of root.querySelectorAll(BLOCKS)) {
    // Skip containers whose text is already captured by a nested block, and table cells.
    if (el.querySelector(BLOCKS) || el.closest("table")) continue;
    const text = textOf(el);
    // Headings keep the structure; other fragments under four words are usually labels or link lists.
    const words = text.split(" ").length;
    if (text.length < 2 || (!HEADINGS.has(el.tagName) && words < 4)) continue;
    if (out[out.length - 1] === text) continue;
    out.push(text);
  }
  return out;
}

function joinBlocks(blocks: string[]): { text: string; truncated: boolean } {
  let text = "";
  for (const block of blocks) {
    if (text.length + block.length + 2 > MAX_TEXT_CHARS) return { text, truncated: true };
    text += (text ? "\n\n" : "") + block;
  }
  return { text, truncated: false };
}

function countWords(text: string): number {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

export function extractArticle(html: string, pageUrl: string): ExtractedArticle {
  const { document } = parseHTML(html);
  const jsonLd = readJsonLd(document);
  const paywallMarkup =
    jsonLd.locked ||
    /^(locked|metered|premium|subscriber)/i.test(meta(document, ["meta[property='article:content_tier']", "meta[name='article:content_tier']"]) ?? "") ||
    document.querySelector("[class*='paywall'], [id*='paywall']") !== null;

  const ogTitle = meta(document, ["meta[property='og:title']", "meta[name='twitter:title']"]);
  const docTitle = textOf(document.querySelector("title"));
  const description = meta(document, ["meta[name='description']", "meta[property='og:description']", "meta[name='twitter:description']"]);
  const siteName = meta(document, ["meta[property='og:site_name']", "meta[name='application-name']"]);
  const canonical = httpUrl(meta(document, ["link[rel='canonical']", "meta[property='og:url']"]), pageUrl);
  const published = normalizeDate(
    meta(document, [
      "meta[property='article:published_time']",
      "meta[name='article:published_time']",
      "meta[itemprop='datePublished']",
      "meta[name='citation_publication_date']",
      "meta[name='dc.date.issued']",
      "meta[name='DC.date.issued']",
      "meta[name='dc.date']",
      "meta[name='DC.date']",
      "meta[name='date']",
      "meta[name='parsely-pub-date']",
      "meta[name='sailthru.date']",
      "time[itemprop='datePublished']",
    ]) ?? jsonLd.datePublished,
  );
  const lang = document.documentElement?.getAttribute("lang")?.slice(0, 12) || undefined;
  const byline = meta(document, ["meta[name='author']", "meta[property='article:author']"]);

  stripClutter(document);

  let blocks: string[] = [];
  let readabilityTitle: string | undefined;
  let readabilityByline: string | undefined;
  try {
    const parsed = new Readability(document as unknown as Document, { charThreshold: 400, keepClasses: false }).parse();
    if (parsed?.content) {
      const { document: content } = parseHTML(`<!doctype html><html><body>${parsed.content}</body></html>`);
      blocks = blocksOf(content.body as unknown as El);
    }
    readabilityTitle = parsed?.title?.trim() || undefined;
    readabilityByline = parsed?.byline?.trim() || undefined;
  } catch {
    blocks = [];
  }

  // Fallback for pages Readability rejects: substantial paragraphs from the page body.
  if (blocks.join(" ").length < MIN_TEXT_CHARS) {
    const { document: fresh } = parseHTML(html);
    stripClutter(fresh);
    const root = (fresh.querySelector("main, article, [role='main']") ?? fresh.body) as El | null;
    const paragraphs = root ? [...root.querySelectorAll("p")].map((p) => textOf(p)).filter((t) => t.length >= 60) : [];
    if (paragraphs.join(" ").length > blocks.join(" ").length) blocks = paragraphs;
  }

  const { text, truncated } = joinBlocks(blocks);
  if (text.length < MIN_TEXT_CHARS) {
    if (paywallMarkup) throw new IngestError("paywalled", "Only a preview is available — the article appears to be behind a paywall. Paste the text yourself if you have access.");
    throw new IngestError("no_content", "No readable article text was found. The page may need JavaScript, be mostly media, or not be an article. You can paste its text manually.");
  }

  const title = (readabilityTitle || ogTitle || jsonLd.headline || docTitle || new URL(pageUrl).hostname).replace(/\s+/g, " ").trim().slice(0, 300);
  return {
    title,
    siteName: siteName?.slice(0, 120),
    byline: (readabilityByline ?? byline)?.replace(/\s+/g, " ").slice(0, 160),
    description: description?.replace(/\s+/g, " ").slice(0, 500),
    canonicalUrl: canonical,
    publishedAt: published,
    lang,
    text,
    wordCount: countWords(text),
    truncated,
    paywallHint: paywallMarkup,
  };
}

/** Plain-text documents: keep paragraphs, enforce the same limits. */
export function extractPlainText(body: string, pageUrl: string): ExtractedArticle {
  const paragraphs = cleanText(body.replace(/\r\n?/g, "\n"))
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const { text, truncated } = joinBlocks(paragraphs);
  if (text.length < MIN_TEXT_CHARS) throw new IngestError("no_content", "The document has too little text to analyse.");
  const firstLine = paragraphs[0] ?? "";
  const path = new URL(pageUrl).pathname.split("/").filter(Boolean).pop();
  return {
    title: (firstLine.length <= 120 ? firstLine : path || new URL(pageUrl).hostname).slice(0, 300),
    text,
    wordCount: countWords(text),
    truncated,
    paywallHint: false,
  };
}

/** Decodes a response body using the declared or sniffed charset, falling back to UTF-8. */
export function decodeBody(body: Buffer, declared?: string): string {
  let charset = declared;
  if (!charset) {
    if (body[0] === 0xef && body[1] === 0xbb && body[2] === 0xbf) charset = "utf-8";
    else if (body[0] === 0xff && body[1] === 0xfe) charset = "utf-16le";
    else if (body[0] === 0xfe && body[1] === 0xff) charset = "utf-16be";
    else {
      const head = body.subarray(0, 4096).toString("latin1");
      charset = head.match(/<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i)?.[1]?.toLowerCase();
    }
  }
  try {
    return new TextDecoder(charset ?? "utf-8", { fatal: false }).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}
