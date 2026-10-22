import type { RawResult } from "@/lib/discovery/rank";
import { plainSnippet } from "@/lib/discovery/rank";
import { asArray, asRecord, type Fetcher, num, readJson, readText, str, Throttle, USER_AGENT, type SearchProvider } from "./common";

/**
 * Scholarly indexes. Each returns bibliographic metadata and, where the index has it, the
 * abstract — which is labelled as supplied by the index, never presented as the page.
 *
 *   OpenAlex   — 250M+ works across every discipline (keyless; OPENALEX_API_KEY raises the quota)
 *   arXiv      — physics, maths, computer science, quantitative biology/finance, economics preprints
 *   Europe PMC — life sciences and biomedicine, including every PubMed record
 */

/** OpenAlex stores abstracts as an inverted index (word -> positions). */
export function abstractFromInvertedIndex(index: unknown): string | undefined {
  const words: string[] = [];
  for (const [word, positions] of Object.entries(asRecord(index))) {
    for (const p of asArray(positions)) if (typeof p === "number" && p >= 0 && p < 5000) words[p] = word;
  }
  const text = words.filter(Boolean).join(" ").trim();
  return text.length >= 80 ? text : undefined;
}

function isPdf(url: string | undefined): boolean {
  return Boolean(url && /\.pdf($|\?)/i.test(url));
}

export function openAlexProvider(fetcher: Fetcher = fetch, options: { apiKey?: string; mailto?: string } = {}): SearchProvider {
  return {
    id: "openalex",
    label: "OpenAlex",
    scope: "web",
    kind: "scholarly",
    keyless: true,
    async search(query, { offset, count, signal }) {
      const page = Math.floor(offset / count) + 1;
      if (page > 5) return { results: [], nextOffset: null };
      const params = new URLSearchParams({
        search: query,
        "per-page": String(count),
        page: String(page),
        filter: "is_retracted:false",
        select: "id,doi,display_name,publication_date,primary_location,best_oa_location,authorships,cited_by_count,type,abstract_inverted_index",
      });
      if (options.mailto) params.set("mailto", options.mailto);
      if (options.apiKey) params.set("api_key", options.apiKey);
      const response = await fetcher(`https://api.openalex.org/works?${params}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal, cache: "no-store" });
      const body = asRecord(await readJson(response, "OpenAlex", Boolean(options.apiKey)));
      const results: RawResult[] = [];
      for (const item of asArray(body.results)) {
        const r = asRecord(item);
        const primary = asRecord(r.primary_location);
        const oa = asRecord(r.best_oa_location);
        const venueSource = asRecord(primary.source);
        const doi = str(r.doi);
        // Prefer an open-access landing page (readable) over the DOI resolver (often paywalled), and never a bare PDF.
        const landing = [str(oa.landing_page_url), str(primary.landing_page_url), doi].find((u) => u && !isPdf(u));
        if (!landing) continue;
        const preprint = r.type === "preprint" || (venueSource.type === "repository" && primary.is_published !== true);
        results.push({
          title: str(r.display_name) ?? "",
          url: landing,
          doi,
          venue: str(venueSource.display_name),
          publisher: str(venueSource.host_organization_name),
          authors: asArray(r.authorships)
            .map((a) => str(asRecord(asRecord(a).author).display_name))
            .filter((a): a is string => Boolean(a))
            .slice(0, 8),
          publishedAt: str(r.publication_date),
          citedBy: num(r.cited_by_count),
          abstract: abstractFromInvertedIndex(r.abstract_inverted_index),
          preprint,
        });
      }
      const total = num(asRecord(body.meta).count) ?? 0;
      return { results, nextOffset: total > page * count && page < 5 ? page * count : null };
    },
  };
}

const ARXIV_THROTTLE = new Throttle(3000);

function xmlField(entry: string, tag: string): string | undefined {
  const match = entry.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return match ? plainSnippet(match[1]) || undefined : undefined;
}

/** Parses arXiv's Atom feed. Only the fields arXiv states are kept. */
export function parseArxivFeed(xml: string): { results: RawResult[]; total: number } {
  const total = Number(xml.match(/<opensearch:totalResults[^>]*>(\d+)</)?.[1] ?? 0);
  const results: RawResult[] = [];
  for (const entry of xml.split("<entry>").slice(1).map((e) => e.split("</entry>")[0])) {
    const id = xmlField(entry, "id");
    const abs = id?.match(/arxiv\.org\/abs\/(.+?)(v\d+)?$/);
    const title = xmlField(entry, "title");
    if (!abs || !title) continue;
    const journal = xmlField(entry, "arxiv:journal_ref");
    results.push({
      title,
      url: `https://arxiv.org/abs/${abs[1]}`,
      abstract: xmlField(entry, "summary"),
      publishedAt: xmlField(entry, "published"),
      authors: [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => plainSnippet(m[1])).filter(Boolean).slice(0, 8),
      doi: xmlField(entry, "arxiv:doi"),
      venue: journal ? `arXiv · ${journal}` : "arXiv",
      preprint: true,
    });
  }
  return { results, total };
}

export function arxivProvider(fetcher: Fetcher = fetch, throttle: Throttle = ARXIV_THROTTLE): SearchProvider {
  return {
    id: "arxiv",
    label: "arXiv",
    scope: "web",
    kind: "scholarly",
    keyless: true,
    async search(query, { offset, count, signal }) {
      if (offset >= 100) return { results: [], nextOffset: null };
      const terms = query
        .replace(/[^\p{L}\p{N}\s-]/gu, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1)
        .slice(0, 6);
      if (terms.length === 0) return { results: [], nextOffset: null };
      const params = new URLSearchParams({ search_query: terms.map((t) => `all:${t}`).join(" AND "), start: String(offset), max_results: String(count), sortBy: "relevance" });
      await throttle.wait(signal);
      const response = await fetcher(`https://export.arxiv.org/api/query?${params}`, { headers: { Accept: "application/atom+xml", "User-Agent": USER_AGENT }, signal, cache: "no-store" });
      const { results, total } = parseArxivFeed(await readText(response, "arXiv"));
      return { results, nextOffset: total > offset + count && offset + count < 100 ? offset + count : null };
    },
  };
}

export function europePmcProvider(fetcher: Fetcher = fetch): SearchProvider {
  return {
    id: "europepmc",
    label: "Europe PMC · PubMed",
    scope: "web",
    kind: "scholarly",
    keyless: true,
    async search(query, { offset, count, signal }) {
      // Europe PMC pages with cursors; ask for enough results to skip the ones already shown.
      const size = offset + count;
      if (size > 50) return { results: [], nextOffset: null };
      const params = new URLSearchParams({ query: `(${query}) AND NOT PUB_TYPE:"retraction of publication"`, format: "json", resultType: "core", pageSize: String(size), cursorMark: "*" });
      const response = await fetcher(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal, cache: "no-store" });
      const body = asRecord(await readJson(response, "Europe PMC", false));
      const items = asArray(asRecord(body.resultList).result).slice(offset);
      const results: RawResult[] = [];
      for (const item of items) {
        const r = asRecord(item);
        const pmid = str(r.pmid);
        const pmcid = str(r.pmcid);
        const doi = str(r.doi);
        const url = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : pmcid ? `https://europepmc.org/article/PMC/${pmcid}` : doi ? `https://doi.org/${doi}` : undefined;
        if (!url) continue;
        const types = asArray(asRecord(r.pubTypeList).pubType).filter((t): t is string => typeof t === "string");
        results.push({
          title: (str(r.title) ?? "").replace(/\.$/, ""),
          url,
          doi,
          authors: (str(r.authorString) ?? "")
            .replace(/\.$/, "")
            .split(/,\s*/)
            .filter(Boolean)
            .slice(0, 8),
          venue: str(asRecord(asRecord(r.journalInfo).journal).title),
          publishedAt: str(r.firstPublicationDate),
          abstract: str(r.abstractText),
          citedBy: num(r.citedByCount),
          preprint: r.source === "PPR" || types.some((t) => /preprint/i.test(t)),
        });
      }
      const hits = num(body.hitCount) ?? 0;
      return { results, nextOffset: hits > size && size + count <= 50 ? size : null };
    },
  };
}
