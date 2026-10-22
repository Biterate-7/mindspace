import type { SearchProviderId, SearchResult, SourceCategory } from "@/types/research";
import { contentWords, jaccard, stem } from "@/lib/generation/text";
import { hashString } from "@/lib/utils/random";
import { classifySource, topicFit, type Classification } from "./classify";
import type { Facet } from "./plan";
import { domainOf, parseHttpUrl, unsupportedFormat, urlKey } from "./url";

/** A result as returned by a provider, before normalisation. Only what the provider states. */
export interface RawResult {
  title: string;
  url: string;
  snippet?: string;
  publishedAt?: string;
  authors?: string[];
  venue?: string;
  doi?: string;
  /** Abstract text supplied by a scholarly index. */
  abstract?: string;
  citedBy?: number;
  preprint?: boolean;
  /** Publisher or host organisation the provider names (e.g. "American Physical Society"). */
  publisher?: string;
  /** Provider facts worth showing ("1,204 GitHub stars", "Accepted answer"). */
  hints?: string[];
  /** When the provider first saw the item (crawl or submission time). Ranking only — never shown as a publication date. */
  seenAt?: string;
}

/** One provider result together with where it came from. */
export interface Candidate {
  result: RawResult;
  provider: SearchProviderId;
  /** Position in that provider's own ranking (0 = first). */
  rank: number;
  query: string;
}

export interface RankOptions {
  facets: readonly Facet[];
  recency: boolean;
  /** Question terms used for relevance; defaults to the question's content words. */
  terms?: readonly string[];
  /** Identity keys already shown or imported; matching results are dropped. */
  exclude?: ReadonlySet<string>;
  startRank?: number;
  limit?: number;
  now?: number;
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

export function normalizeDoi(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/10\.\d{4,9}\/\S+/);
  return match ? match[0].replace(/[.,;)\]]+$/, "").toLowerCase() : undefined;
}

/**
 * Every identity a result answers to: its normalised address plus DOI, arXiv id, PubMed id
 * or repository name. Two results sharing any identity are the same work, so a paper found
 * as a DOI link, an arXiv preprint and a PubMed record becomes one source.
 */
export function identityKeys(url: URL, doi?: string): string[] {
  const keys = [urlKey(url)];
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const d = normalizeDoi(doi) ?? (host === "doi.org" || host === "dx.doi.org" ? normalizeDoi(decodeURIComponent(url.pathname.slice(1))) : undefined);
  if (d) keys.push(`doi:${d}`);
  const arxiv = host.endsWith("arxiv.org") ? url.pathname.match(/^\/(?:abs|pdf|html)\/([a-z-]+(?:\.[a-z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?(?:\.pdf)?\/?$/i) : null;
  if (arxiv) keys.push(`arxiv:${arxiv[1].toLowerCase()}`);
  const pmid = host === "pubmed.ncbi.nlm.nih.gov" ? url.pathname.match(/^\/(\d+)\/?$/) : host === "ncbi.nlm.nih.gov" ? url.pathname.match(/^\/pubmed\/(\d+)\/?$/) : null;
  if (pmid) keys.push(`pmid:${pmid[1]}`);
  const repo = host === "github.com" ? url.pathname.match(/^\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/) : null;
  if (repo) keys.push(`gh:${repo[1].toLowerCase()}/${repo[2].toLowerCase()}`);
  return [...new Set(keys)];
}

function validDate(value: string | undefined): string | undefined {
  return value && Number.isFinite(Date.parse(value)) ? value : undefined;
}

interface Entry {
  url: URL;
  key: string;
  keys: Set<string>;
  domain: string;
  title: string;
  snippet: string;
  abstract?: string;
  publishedAt?: string;
  seenAt?: string;
  authors?: string[];
  venue?: string;
  publisher?: string;
  doi?: string;
  citedBy?: number;
  /** True or false when a provider said so; undefined when unknown. */
  preprint?: boolean;
  hints: string[];
  providers: SearchProviderId[];
  /** Best (lowest) position per provider. */
  ranks: Map<SearchProviderId, number>;
  query: string;
  extraSignals: string[];
}

/** Providers whose page for a work is the most likely to be readable, best first. */
const URL_PREFERENCE: readonly SearchProviderId[] = ["europepmc", "arxiv", "openalex", "worldbank", "federalregister"];

function urlScore(entry: Entry): number {
  const pref = URL_PREFERENCE.indexOf(entry.providers[0]);
  let score = pref < 0 ? 0 : URL_PREFERENCE.length - pref;
  if (entry.domain === "doi.org") score -= 10;
  if (unsupportedFormat(entry.url.href)) score -= 20;
  return score;
}

function toEntry(c: Candidate): Entry | null {
  const url = parseHttpUrl(c.result.url ?? "");
  const title = plainSnippet(c.result.title ?? "").slice(0, 300);
  if (!url || !title) return null;
  const doi = normalizeDoi(c.result.doi);
  const authors = (c.result.authors ?? []).map((a) => plainSnippet(a)).filter(Boolean).slice(0, 12);
  const abstract = c.result.abstract ? plainSnippet(c.result.abstract).slice(0, 4000) : undefined;
  return {
    url,
    key: urlKey(url),
    keys: new Set(identityKeys(url, doi)),
    domain: domainOf(url),
    title,
    snippet: plainSnippet(c.result.snippet ?? "").slice(0, 600),
    abstract: abstract && abstract.length >= 80 ? abstract : undefined,
    publishedAt: validDate(c.result.publishedAt),
    seenAt: validDate(c.result.seenAt),
    authors: authors.length ? authors : undefined,
    venue: c.result.venue ? plainSnippet(c.result.venue).slice(0, 160) || undefined : undefined,
    publisher: c.result.publisher ? plainSnippet(c.result.publisher).slice(0, 120) || undefined : undefined,
    doi,
    citedBy: typeof c.result.citedBy === "number" && Number.isFinite(c.result.citedBy) && c.result.citedBy >= 0 ? Math.round(c.result.citedBy) : undefined,
    preprint: typeof c.result.preprint === "boolean" ? c.result.preprint : undefined,
    hints: (c.result.hints ?? []).slice(0, 4),
    providers: [c.provider],
    ranks: new Map([[c.provider, c.rank]]),
    query: c.query,
    extraSignals: [],
  };
}

/** Folds `other` into `base`: the best address wins, missing metadata is filled, providers are combined. */
function absorb(base: Entry, other: Entry): Entry {
  const [primary, secondary] = urlScore(other) > urlScore(base) ? [other, base] : [base, other];
  const providers = [...new Set([...primary.providers, ...secondary.providers])];
  const ranks = new Map(primary.ranks);
  for (const [p, r] of secondary.ranks) ranks.set(p, Math.min(r, ranks.get(p) ?? r));
  const longer = <T extends { length: number }>(a: T | undefined, b: T | undefined) => (a && b ? (b.length > a.length ? b : a) : (a ?? b));
  // A journal record outranks a preprint for venue and date; the work is a preprint only if every copy is.
  const journal = primary.preprint === false ? primary : secondary.preprint === false ? secondary : primary;
  return {
    ...primary,
    keys: new Set([...primary.keys, ...secondary.keys]),
    snippet: primary.snippet || secondary.snippet,
    abstract: longer(primary.abstract, secondary.abstract),
    publishedAt: journal.publishedAt ?? primary.publishedAt ?? secondary.publishedAt,
    seenAt: primary.seenAt ?? secondary.seenAt,
    authors: longer(primary.authors, secondary.authors),
    venue: journal.venue ?? primary.venue ?? secondary.venue,
    publisher: journal.publisher ?? primary.publisher ?? secondary.publisher,
    doi: primary.doi ?? secondary.doi,
    citedBy: Math.max(primary.citedBy ?? -1, secondary.citedBy ?? -1) >= 0 ? Math.max(primary.citedBy ?? 0, secondary.citedBy ?? 0) : undefined,
    preprint: primary.preprint === false || secondary.preprint === false ? false : primary.preprint || secondary.preprint ? true : undefined,
    hints: [...new Set([...primary.hints, ...secondary.hints])].slice(0, 4),
    providers,
    ranks,
    extraSignals: [...new Set([...primary.extraSignals, ...secondary.extraSignals, ...((primary.preprint === true && secondary.preprint === false) || (primary.preprint === false && secondary.preprint === true) ? ["Preprint and published versions found"] : [])])],
  };
}

/** Merges results that share any identity key (union by key, order preserved). */
function mergeByIdentity(entries: Entry[]): Entry[] {
  const owner = new Map<string, number>();
  const merged: Array<Entry | null> = [];
  for (const entry of entries) {
    const hits = [...new Set([...entry.keys].map((k) => owner.get(k)).filter((i): i is number => i !== undefined))].sort((a, b) => a - b);
    if (hits.length === 0) {
      merged.push(entry);
      for (const k of entry.keys) owner.set(k, merged.length - 1);
      continue;
    }
    let target = merged[hits[0]] as Entry;
    for (const i of hits.slice(1)) {
      target = absorb(target, merged[i] as Entry);
      merged[i] = null;
    }
    target = absorb(target, entry);
    merged[hits[0]] = target;
    for (const k of target.keys) owner.set(k, hits[0]);
  }
  return merged.filter((e): e is Entry => e !== null);
}

interface Scored extends Entry {
  cls: Classification;
  relevance: number;
  score: number;
}

function titleStems(title: string): Set<string> {
  return new Set(contentWords(title).map(stem));
}

function normTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * Collapses copies: one site's page under two addresses with the same title, and syndicated
 * stories under (nearly) the same headline on several domains, keep only the best-rated
 * copy — which notes where else the story ran.
 */
function collapseSyndication(items: Scored[]): Scored[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const kept: Array<Scored & { stems: Set<string>; norm: string }> = [];
  for (const item of sorted) {
    const stems = titleStems(item.title);
    const norm = normTitle(item.title);
    if (kept.some((k) => k.domain === item.domain && k.norm === norm)) continue;
    const twin = stems.size >= 5 ? kept.find((k) => k.domain !== item.domain && k.stems.size >= 5 && jaccard(k.stems, stems) >= 0.8) : undefined;
    if (twin) {
      const note = twin.extraSignals.find((s) => s.startsWith("Same story also at "));
      const domains = note ? `${note.slice("Same story also at ".length)}, ${item.domain}` : item.domain;
      twin.extraSignals = [...twin.extraSignals.filter((s) => s !== note), `Same story also at ${domains}`];
      twin.providers = [...new Set([...twin.providers, ...item.providers])];
      continue;
    }
    kept.push({ ...item, stems, norm });
  }
  return kept;
}

function ageInDays(value: string | undefined, now: number): number | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isFinite(time) ? (now - time) / 86_400_000 : undefined;
}

function scoreEntry(entry: Entry, queryStems: ReadonlySet<string>, phrases: readonly string[], options: RankOptions, now: number): Scored {
  const cls = classifySource({ url: entry.url.href, domain: entry.domain, title: entry.title, provider: entry.providers[0], venue: entry.venue, citedBy: entry.citedBy, preprint: entry.preprint, hints: entry.hints });
  const inTitle = titleStems(entry.title);
  const inBody = new Set(contentWords(`${entry.snippet} ${entry.abstract ?? ""}`).map(stem));
  let titleHits = 0;
  let bodyHits = 0;
  for (const s of queryStems) {
    if (inTitle.has(s)) titleHits++;
    if (inBody.has(s) || inTitle.has(s)) bodyHits++;
  }
  const lowerTitle = entry.title.toLowerCase();
  const phraseBonus = phrases.some((p) => lowerTitle.includes(p)) ? 0.12 : 0;
  // Results that touch under half the question's terms count only if their title carries two of them.
  const loose = queryStems.size >= 3 && bodyHits < queryStems.size / 2 && titleHits < 2;
  const relevance = queryStems.size ? (loose ? 0 : Math.min(1, (0.6 * titleHits + 0.4 * bodyHits) / queryStems.size + phraseBonus)) : 0.5;

  const bestRank = Math.min(...entry.ranks.values());
  const providerScore = 1 / (1 + bestRank * 0.2);
  const agreement = Math.min(0.2, (entry.providers.length - 1) * 0.1);
  let recency = 0;
  const age = ageInDays(entry.publishedAt ?? entry.seenAt, now);
  if (options.recency) {
    if (age === undefined) recency = cls.category === "reference" ? 0 : -0.08;
    else if (age <= 45) recency = 0.35;
    else if (age <= 365) recency = 0.22;
    else if (age <= 3 * 365) recency = 0.05;
    else recency = -0.15;
  } else if (entry.citedBy) {
    // Foundational work stays visible when the question is not about recent events.
    recency = Math.min(0.2, Math.log10(entry.citedBy + 1) * 0.05);
  }
  // A file Discovery cannot read and has no abstract for cannot become a source, so it sinks below everything importable.
  const unreadable = unsupportedFormat(entry.url.href) && !entry.abstract ? -1.5 : 0;
  const score = 1.7 * relevance + 0.55 * providerScore + 0.5 * cls.quality + 0.6 * topicFit(cls.category, options.facets) + agreement + recency + unreadable;
  return { ...entry, cls, relevance, score };
}

/** Results below this question-term coverage are dropped as loosely related. */
const MIN_RELEVANCE = 0.12;
/** Wikipedia may be one voice among many: at most three results, and fewer in a short list. */
function wikipediaCap(candidates: number): number {
  return Math.max(1, Math.min(3, Math.round(candidates * 0.15)));
}

/**
 * The "site" a result counts as for diversity. DOI links all live on doi.org but belong to
 * different publishers, so they are grouped by the publisher or journal the index names.
 */
function siteOf(item: Scored): string {
  if ((item.domain === "doi.org" || item.domain === "dx.doi.org") && (item.publisher || item.venue)) return `publisher:${(item.publisher ?? item.venue ?? "").toLowerCase()}`;
  return item.domain;
}

/**
 * Greedy diversity pick: each step takes the best remaining result after penalties for
 * repeating a site, over-filling one kind of source, or leaning on Wikipedia.
 */
function diversify(items: Scored[], limit: number): Scored[] {
  const maxWikipedia = wikipediaCap(Math.min(items.length, limit));
  const remaining = [...items];
  const picked: Scored[] = [];
  const perDomain = new Map<string, number>();
  const perCategory = new Map<SourceCategory, number>();
  let wikipedia = 0;
  while (remaining.length && picked.length < limit) {
    let best = -1;
    let bestScore = -Infinity;
    remaining.forEach((item, i) => {
      const isWiki = item.domain.endsWith("wikipedia.org");
      if (isWiki && wikipedia >= maxWikipedia) return;
      const sameDomain = perDomain.get(siteOf(item)) ?? 0;
      const share = picked.length >= 4 ? (perCategory.get(item.cls.category) ?? 0) / picked.length : 0;
      const adjusted = item.score - [0, 0.35, 1, 2][Math.min(3, sameDomain)] - (share > 0.45 ? 0.3 : 0) - (isWiki ? 0.2 + wikipedia * 0.6 : 0);
      if (adjusted > bestScore) {
        bestScore = adjusted;
        best = i;
      }
    });
    if (best < 0) break;
    const [item] = remaining.splice(best, 1);
    picked.push(item);
    perDomain.set(siteOf(item), (perDomain.get(siteOf(item)) ?? 0) + 1);
    perCategory.set(item.cls.category, (perCategory.get(item.cls.category) ?? 0) + 1);
    if (item.domain.endsWith("wikipedia.org")) wikipedia++;
  }
  return picked;
}

/**
 * Normalises, deduplicates, rates and diversifies results from several providers.
 * Titles, snippets, abstracts, authors and dates are exactly what providers returned —
 * cleaned of markup, never rewritten or invented.
 */
export function rankFederated(candidates: readonly Candidate[], question: string, options: RankOptions): SearchResult[] {
  const now = options.now ?? Date.now();
  const exclude = options.exclude ?? new Set<string>();
  const terms = options.terms?.length ? options.terms.join(" ") : question;
  const words = contentWords(terms);
  const queryStems = new Set(words.map(stem));
  const phrases = words.slice(0, -1).map((w, i) => `${w} ${words[i + 1]}`);

  const entries = mergeByIdentity(candidates.map(toEntry).filter((e): e is Entry => e !== null)).filter((e) => ![...e.keys].some((k) => exclude.has(k)));
  const scored = collapseSyndication(entries.map((e) => scoreEntry(e, queryStems, phrases, options, now))).filter((s) => s.relevance >= MIN_RELEVANCE);
  const startRank = options.startRank ?? 0;
  return diversify(scored, options.limit ?? 60).map((s, i) => {
    const signals = [...s.cls.signals, ...s.extraSignals];
    if (s.providers.length > 1) signals.push(`Found by ${s.providers.length} providers`);
    const result: SearchResult = {
      id: `r_${hashString(s.key).toString(36)}`,
      title: s.title,
      url: s.url.href,
      key: s.key,
      domain: s.domain,
      snippet: s.snippet,
      publishedAt: s.publishedAt,
      provider: s.providers[0],
      rank: startRank + i,
      unsupported: unsupportedFormat(s.url.href),
      providers: s.providers,
      category: s.cls.category,
      sourceRole: s.cls.role,
      authors: s.authors,
      venue: s.venue,
      publisher: s.publisher,
      doi: s.doi,
      abstract: s.abstract,
      citedBy: s.citedBy,
      preprint: s.cls.preprint || undefined,
      altKeys: [...s.keys].filter((k) => k !== s.key),
      signals: [...new Set(signals)].slice(0, 6),
      query: s.query,
    };
    for (const key of Object.keys(result) as Array<keyof SearchResult>) if (result[key] === undefined) delete result[key];
    if (result.altKeys?.length === 0) delete result.altKeys;
    return result;
  });
}
