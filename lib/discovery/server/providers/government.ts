import type { RawResult } from "@/lib/discovery/rank";
import { asArray, asRecord, type Fetcher, num, readJson, str, USER_AGENT, type SearchProvider } from "./common";

/**
 * Primary public-sector documents, both keyless:
 *
 *   Federal Register — US federal rules, proposed rules, notices and presidential documents
 *   World Bank       — research working papers, policy reports and country studies
 */

export function federalRegisterProvider(fetcher: Fetcher = fetch): SearchProvider {
  return {
    id: "federalregister",
    label: "Federal Register",
    scope: "web",
    kind: "government",
    keyless: true,
    async search(query, { offset, count, signal }) {
      const page = Math.floor(offset / count) + 1;
      if (page > 3) return { results: [], nextOffset: null };
      const params = new URLSearchParams({ "conditions[term]": query, per_page: String(count), page: String(page), order: "relevance" });
      for (const field of ["title", "html_url", "abstract", "publication_date", "agencies", "type"]) params.append("fields[]", field);
      const response = await fetcher(`https://www.federalregister.gov/api/v1/documents.json?${params}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal, cache: "no-store" });
      const body = asRecord(await readJson(response, "Federal Register", false));
      const results: RawResult[] = asArray(body.results).map((item) => {
        const r = asRecord(item);
        const agencies = asArray(r.agencies)
          .map((a) => str(asRecord(a).name))
          .filter((a): a is string => Boolean(a));
        const type = str(r.type);
        return {
          title: str(r.title) ?? "",
          url: str(r.html_url) ?? "",
          snippet: str(r.abstract)?.slice(0, 600),
          publishedAt: str(r.publication_date),
          venue: [type ? `Federal Register ${type.toLowerCase()}` : "Federal Register", agencies.slice(0, 2).join(", ")].filter(Boolean).join(" · "),
        };
      });
      const pages = num(body.total_pages) ?? 0;
      return { results, nextOffset: page < pages && page < 3 ? page * count : null };
    },
  };
}

export function worldBankProvider(fetcher: Fetcher = fetch): SearchProvider {
  return {
    id: "worldbank",
    label: "World Bank documents",
    scope: "web",
    kind: "government",
    keyless: true,
    async search(query, { offset, count, signal }) {
      if (offset >= 60) return { results: [], nextOffset: null };
      const params = new URLSearchParams({ format: "json", qterm: query, rows: String(count), os: String(offset), fl: "docdt,display_title,url,docty,abstracts,lang" });
      const response = await fetcher(`https://search.worldbank.org/api/v2/wds?${params}`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal, cache: "no-store" });
      const body = asRecord(await readJson(response, "World Bank", false));
      const results: RawResult[] = [];
      for (const [id, item] of Object.entries(asRecord(body.documents))) {
        if (id === "facets") continue;
        const r = asRecord(item);
        const url = str(r.url)?.replace(/^http:\/\//, "https://");
        const lang = str(r.lang);
        if (!url || (lang && !/english/i.test(lang))) continue;
        const abstract = str(asRecord(r.abstracts)["cdata!"]);
        results.push({
          title: (str(r.display_title) ?? "").replace(/\s+/g, " ").trim(),
          url,
          abstract: abstract?.replace(/\s+/g, " ").trim(),
          publishedAt: str(r.docdt),
          venue: str(r.docty) ? `World Bank · ${str(r.docty)}` : "World Bank",
        });
      }
      const total = num(body.total) ?? 0;
      return { results, nextOffset: total > offset + count && offset + count < 60 ? offset + count : null };
    },
  };
}
