import { describe, expect, it } from "vitest";
import type { SearchProviderId } from "@/types/research";
import { classifySource } from "@/lib/discovery/classify";
import { planResearch } from "@/lib/discovery/plan";
import { identityKeys, rankFederated, type Candidate, type RawResult } from "@/lib/discovery/rank";
import { TtlCache } from "@/lib/discovery/server/cache";
import { IngestError } from "@/lib/discovery/server/errors";
import { federatedSearch } from "@/lib/discovery/server/federated";
import { Throttle, type SearchPage, type SearchProvider } from "@/lib/discovery/server/providers/common";
import { federalRegisterProvider, worldBankProvider } from "@/lib/discovery/server/providers/government";
import { gdeltProvider } from "@/lib/discovery/server/providers/news";
import { abstractFromInvertedIndex, arxivProvider, europePmcProvider, openAlexProvider, parseArxivFeed } from "@/lib/discovery/server/providers/scholarly";
import { gitHubProvider, hackerNewsProvider, stackExchangeProvider } from "@/lib/discovery/server/providers/technical";

const signal = new AbortController().signal;
const NOW = Date.parse("2026-10-21T12:00:00Z");

function jsonFetch(handler: (url: string, init?: RequestInit) => unknown, status = 200, headers: Record<string, string> = {}): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify(handler(String(input), init)), { status, headers: { "content-type": "application/json", ...headers } })) as typeof fetch;
}

function textFetch(body: string, status = 200): typeof fetch {
  return (async () => new Response(body, { status, headers: { "content-type": "text/plain" } })) as typeof fetch;
}

const noWait = new Throttle(0);

// --- Planning ----------------------------------------------------------------------

describe("research planning", () => {
  it("routes a physics question to scholarly indexes, not code or news", () => {
    const plan = planResearch("How does quantum entanglement work?");
    expect(plan.facets).toContain("science");
    expect(plan.providers.has("openalex")).toBe(true);
    expect(plan.providers.has("arxiv")).toBe(true);
    expect(plan.providers.has("github")).toBe(false);
    expect(plan.providers.has("gdelt")).toBe(false);
    expect(plan.recency).toBe(false);
    // Keyword indexes get the key terms, without the question's intent words.
    expect(plan.queries.scholarly[0].toLowerCase()).toBe("quantum entanglement");
    expect(plan.queries.web[0]).toBe("How does quantum entanglement work?");
    expect(plan.queries.web).toHaveLength(2);
  });

  it("routes a software question to documentation, repositories and Q&A", () => {
    const plan = planResearch("How do I handle errors in async Rust code?");
    expect(plan.facets).toContain("software");
    for (const id of ["github", "stackexchange", "hackernews"] as const) expect(plan.providers.has(id)).toBe(true);
    expect(plan.providers.has("europepmc")).toBe(false);
    expect(plan.queries.web[1]).toMatch(/documentation$/);
  });

  it("treats current events as recency-sensitive and asks the news index", () => {
    const plan = planResearch("What is the latest news on inflation and interest rates in 2026?");
    expect(plan.recency).toBe(true);
    expect(plan.providers.has("gdelt")).toBe(true);
    expect(plan.providers.has("federalregister")).toBe(true);
    expect(plan.providers.has("worldbank")).toBe(true);
    // The year helps news and web search but would narrow research indexes to nothing.
    expect(plan.queries.web[0]).toContain("2026");
    expect(plan.queries.scholarly[0]).not.toContain("2026");
  });

  it("does not send history questions to this quarter's news or current regulations", () => {
    const plan = planResearch("Why did the Treaty of Versailles contribute to World War II?");
    expect(plan.facets).toContain("history");
    expect(plan.providers.has("gdelt")).toBe(false);
    expect(plan.providers.has("federalregister")).toBe(false);
    expect(plan.providers.has("openalex")).toBe(true);
  });

  it("sends biomedical questions to Europe PMC / PubMed", () => {
    const plan = planResearch("Does intermittent fasting improve insulin resistance?");
    expect(plan.facets).toContain("health");
    expect(plan.providers.has("europepmc")).toBe(true);
  });

  it("keeps acronyms and numerals that look like stop words", () => {
    expect(planResearch("Why did World War II start?").terms).toEqual(["World", "War", "II", "start"]);
  });
});

// --- Classification ------------------------------------------------------------------

describe("source classification", () => {
  const classify = (url: string, provider: SearchProviderId = "brave", extra = {}) => classifySource({ url, domain: new URL(url).hostname.replace(/^www\./, ""), title: "A page", provider, ...extra });

  it("labels publishers and evidence roles", () => {
    expect(classify("https://www.bls.gov/cpi/")).toMatchObject({ category: "government", role: "primary" });
    expect(classify("https://www.nytimes.com/2026/01/02/business/inflation.html")).toMatchObject({ category: "news", role: "secondary" });
    expect(classify("https://www.nytimes.com/2026/01/02/opinion/inflation.html")).toMatchObject({ category: "news", role: "opinion" });
    expect(classify("https://en.wikipedia.org/wiki/Inflation")).toMatchObject({ category: "reference", role: "reference" });
    expect(classify("https://docs.python.org/3/library/asyncio.html")).toMatchObject({ category: "documentation", role: "primary" });
    expect(classify("https://github.com/tokio-rs/tokio")).toMatchObject({ category: "code" });
    expect(classify("https://stackoverflow.com/questions/1")).toMatchObject({ category: "discussion", role: "opinion" });
    expect(classify("https://physics.mit.edu/research/")).toMatchObject({ category: "educational" });
  });

  it("does not grant academic standing to journal-looking sites outside any index", () => {
    const fake = classify("https://international-journal-of-advanced-research.com/paper/1");
    expect(fake.category).toBe("web");
    expect(fake.signals.join(" ")).toMatch(/not found in a scholarly index/);
    const indexed = classify("https://doi.org/10.1103/revmodphys.81.865", "openalex", { venue: "Reviews of Modern Physics", citedBy: 9000 });
    expect(indexed.category).toBe("academic");
    expect(indexed.quality).toBeGreaterThan(fake.quality);
    expect(classify("https://arxiv.org/abs/2111.08018", "arxiv").signals).toContain("Preprint — not peer reviewed");
  });

  it("demotes content farms and aggregators", () => {
    expect(classify("https://www.coursehero.com/file/123/").quality).toBeLessThan(0);
    expect(classify("https://www.msn.com/en-us/news/story").quality).toBeLessThan(0);
  });
});

// --- Ranking: identity, diversity, quality ---------------------------------------------

function cand(provider: SearchProviderId, result: RawResult, rank = 0, query = "q"): Candidate {
  return { result, provider, rank, query };
}

describe("federated ranking", () => {
  it("merges one paper found as a DOI link, an arXiv preprint and a scholarly record", () => {
    const doi = "10.1007/978-3-031-03998-0_9";
    const results = rankFederated(
      [
        cand("openalex", { title: "Entanglement dynamics in hybrid quantum circuits", url: "https://arxiv.org/abs/2111.08018", doi: `https://doi.org/${doi}`, venue: "Springer", citedBy: 40, publishedAt: "2022-01-01", preprint: false }),
        cand("arxiv", { title: "Entanglement dynamics in hybrid quantum circuits", url: "https://arxiv.org/abs/2111.08018v2", doi, preprint: true, abstract: "We review recent progress in understanding entanglement dynamics in ensembles of random quantum circuits, through a statistical mechanics lens." }),
        cand("brave", { title: "Entanglement dynamics in hybrid quantum circuits | SpringerLink", url: `https://doi.org/${doi}` }),
      ],
      "entanglement dynamics quantum circuits",
      { facets: ["science"], recency: false, now: NOW },
    );
    expect(results).toHaveLength(1);
    const [paper] = results;
    expect(paper.providers).toEqual(expect.arrayContaining(["openalex", "arxiv", "brave"]));
    expect(paper.altKeys).toEqual(expect.arrayContaining([`doi:${doi}`, "arxiv:2111.08018"]));
    expect(paper.domain).toBe("arxiv.org");
    expect(paper.abstract).toMatch(/^We review/);
    expect(paper.citedBy).toBe(40);
    // A published version exists, so the work is not presented as only a preprint.
    expect(paper.preprint).toBeUndefined();
    expect(paper.signals).toContain("Found by 3 providers");
  });

  it("collapses syndicated copies of one story across news sites", () => {
    const headline = "Central bank raises interest rates to fight persistent inflation";
    const results = rankFederated(
      [cand("gdelt", { title: headline, url: "https://www.reuters.com/markets/rates-1" }), cand("gdelt", { title: `${headline} - MSN`, url: "https://www.msn.com/en-us/money/rates-1" }, 1), cand("gdelt", { title: headline, url: "https://news.yahoo.com/rates-1" }, 2)],
      "interest rates inflation",
      { facets: ["economics", "news"], recency: true, now: NOW },
    );
    expect(results).toHaveLength(1);
    expect(results[0].domain).toBe("reuters.com");
    expect(results[0].signals?.some((s) => s.startsWith("Same story also at"))).toBe(true);
  });

  it("keeps Wikipedia to a few results and never lets it lead over comparable sources", () => {
    const wiki = Array.from({ length: 6 }, (_, i) => cand("wikipedia", { title: `Quantum entanglement ${["", "swapping", "witness", "distillation", "monogamy", "entropy"][i]}`.trim(), url: `https://en.wikipedia.org/wiki/Quantum_entanglement_${i}`, snippet: "quantum entanglement" }, i));
    const others = [
      cand("openalex", { title: "Quantum entanglement", url: "https://doi.org/10.1103/revmodphys.81.865", venue: "Reviews of Modern Physics", citedBy: 9000, abstract: "All our former experience with application of quantum theory seems to say that what is predicted by quantum formalism must occur in laboratory." }),
      cand("arxiv", { title: "Measures of quantum entanglement", url: "https://arxiv.org/abs/0702225", preprint: true }),
      cand("hackernews", { title: "Quantum entanglement explained simply", url: "https://www.quantamagazine.org/entanglement-explained" }),
    ];
    const results = rankFederated([...wiki, ...others], "quantum entanglement", { facets: ["science"], recency: false, now: NOW });
    expect(results.filter((r) => r.domain.endsWith("wikipedia.org")).length).toBeLessThanOrEqual(3);
    expect(results[0].domain.endsWith("wikipedia.org")).toBe(false);
    expect(new Set(results.slice(0, 4).map((r) => r.domain)).size).toBe(4);
  });

  it("spreads the first results across domains", () => {
    const sameSite = Array.from({ length: 5 }, (_, i) => cand("brave", { title: `Rust async error handling guide part ${i + 1}`, url: `https://blog.example.com/rust-async-${i}` }, i));
    const others = [
      cand("brave", { title: "Error handling in async Rust", url: "https://doc.rust-lang.org/async-book/errors.html" }, 5),
      cand("stackexchange", { title: "How to handle errors in async Rust functions?", url: "https://stackoverflow.com/questions/2" }),
      cand("github", { title: "tokio-rs/tokio", url: "https://github.com/tokio-rs/tokio", snippet: "async runtime for Rust with error handling utilities" }),
    ];
    const results = rankFederated([...sameSite, ...others], "rust async error handling", { facets: ["software"], recency: false, now: NOW });
    expect(new Set(results.slice(0, 4).map((r) => r.domain)).size).toBeGreaterThanOrEqual(3);
    expect(results.slice(0, 3).some((r) => r.domain === "doc.rust-lang.org")).toBe(true);
  });

  it("prefers relevant, credible and (when it matters) recent sources", () => {
    const results = rankFederated(
      [
        cand("brave", { title: "Climate tipping points homework answers", url: "https://www.coursehero.com/file/1/climate-tipping-points" }, 0),
        cand("brave", { title: "Climate tipping points explained", url: "https://climate.mit.edu/explainers/tipping-points" }, 1),
        cand("brave", { title: "Best garden tools of the year", url: "https://garden.example/tools" }, 2),
      ],
      "climate tipping points",
      { facets: ["science"], recency: false, now: NOW },
    );
    expect(results[0].domain).toBe("climate.mit.edu");
    expect(results.some((r) => r.domain === "garden.example")).toBe(false);

    const news = rankFederated(
      [cand("brave", { title: "Election results and turnout analysis", url: "https://archive.example/2015/election", publishedAt: "2015-05-08" }, 0), cand("brave", { title: "Election results and turnout analysis", url: "https://www.apnews.com/article/election-1", publishedAt: "2026-10-12" }, 1)],
      "election results turnout",
      { facets: ["news"], recency: true, now: NOW },
    );
    expect(news[0].domain).toBe("apnews.com");
  });

  it("passes missing metadata through as missing — nothing is invented", () => {
    const [result] = rankFederated([cand("brave", { title: "Coral reef bleaching", url: "https://reef.example/bleaching" })], "coral reef bleaching", { facets: ["science"], recency: false, now: NOW });
    for (const field of ["publishedAt", "authors", "venue", "doi", "abstract", "citedBy", "preprint"] as const) expect(result[field]).toBeUndefined();
    expect(result.snippet).toBe("");
  });

  it("derives identities from DOIs, arXiv, PubMed and GitHub addresses", () => {
    expect(identityKeys(new URL("https://arxiv.org/pdf/2111.08018v3.pdf"))).toContain("arxiv:2111.08018");
    expect(identityKeys(new URL("https://pubmed.ncbi.nlm.nih.gov/12345/"))).toContain("pmid:12345");
    expect(identityKeys(new URL("https://github.com/Tokio-RS/Tokio"))).toContain("gh:tokio-rs/tokio");
    expect(identityKeys(new URL("https://doi.org/10.1038/NATURE12373"))).toContain("doi:10.1038/nature12373");
  });
});

// --- Provider adapters -----------------------------------------------------------------

describe("scholarly providers", () => {
  it("OpenAlex: rebuilds abstracts, prefers readable open-access pages, never a bare PDF", async () => {
    let seen = "";
    const provider = openAlexProvider(
      jsonFetch((url) => {
        seen = url;
        return {
          meta: { count: 30 },
          results: [
            {
              display_name: "Quantum entanglement",
              doi: "https://doi.org/10.1103/revmodphys.81.865",
              publication_date: "2009-06-17",
              cited_by_count: 9000,
              type: "article",
              primary_location: { landing_page_url: "https://doi.org/10.1103/revmodphys.81.865", is_published: true, source: { display_name: "Reviews of Modern Physics", type: "journal" } },
              best_oa_location: { landing_page_url: "http://arxiv.org/abs/quant-ph/0702225", pdf_url: "https://arxiv.org/pdf/quant-ph/0702225" },
              authorships: [{ author: { display_name: "Ryszard Horodecki" } }, { author: { display_name: "Paweł Horodecki" } }],
              abstract_inverted_index: { All: [0], our: [1], former: [2], experience: [3], with: [4], application: [5], of: [6], quantum: [7], theory: [8], seems: [9], to: [10], say: [11], that: [12], what: [13], is: [14], predicted: [15] },
            },
            { display_name: "PDF only", primary_location: { landing_page_url: "https://example.org/paper.pdf" } },
          ],
        };
      }),
      { mailto: "research@example.org" },
    );
    const page = await provider.search("quantum entanglement", { offset: 0, count: 10, signal });
    expect(seen).toContain("mailto=research%40example.org");
    expect(seen).toContain("is_retracted%3Afalse");
    expect(page.results).toHaveLength(1);
    expect(page.results[0]).toMatchObject({ url: "http://arxiv.org/abs/quant-ph/0702225", venue: "Reviews of Modern Physics", citedBy: 9000, publishedAt: "2009-06-17", authors: ["Ryszard Horodecki", "Paweł Horodecki"], preprint: false });
    expect(page.results[0].abstract).toBe("All our former experience with application of quantum theory seems to say that what is predicted");
    expect(page.nextOffset).toBe(10);
    expect(abstractFromInvertedIndex({ too: [0], short: [1] })).toBeUndefined();
  });

  it("arXiv: parses the Atom feed into versionless abstract pages", async () => {
    const xml = `<feed><opensearch:totalResults>44379</opensearch:totalResults><entry><id>http://arxiv.org/abs/2111.08018v2</id><title>Entanglement dynamics in
      hybrid quantum circuits</title><summary>We review progress &amp; open problems.</summary><published>2021-11-15T19:00:01Z</published><author><name>Andrew C. Potter</name></author><author><name>Romain Vasseur</name></author><arxiv:doi>10.1007/978-3-031-03998-0_9</arxiv:doi><arxiv:journal_ref>Springer (2022)</arxiv:journal_ref></entry></feed>`;
    expect(parseArxivFeed(xml).results[0]).toEqual({
      title: "Entanglement dynamics in hybrid quantum circuits",
      url: "https://arxiv.org/abs/2111.08018",
      abstract: "We review progress & open problems.",
      publishedAt: "2021-11-15T19:00:01Z",
      authors: ["Andrew C. Potter", "Romain Vasseur"],
      doi: "10.1007/978-3-031-03998-0_9",
      venue: "arXiv · Springer (2022)",
      preprint: true,
    });
    const page = await arxivProvider(textFetch(xml), noWait).search("quantum entanglement", { offset: 0, count: 10, signal });
    expect(page.nextOffset).toBe(10);
  });

  it("Europe PMC: links PubMed records and flags preprints", async () => {
    const provider = europePmcProvider(
      jsonFetch(() => ({
        hitCount: 2,
        resultList: {
          result: [
            { pmid: "42803380", doi: "10.2337/dci26-0146", title: "The Insulin Resistance Mosaic.", authorString: "James DE, Smith A.", journalInfo: { journal: { title: "Diabetes care" } }, firstPublicationDate: "2026-09-28", abstractText: "Insulin resistance is framed as a defect.", citedByCount: 0, pubTypeList: { pubType: ["Journal Article"] } },
            { source: "PPR", doi: "10.1101/2026.01.01", title: "A preprint", pubTypeList: { pubType: ["Preprint"] } },
          ],
        },
      })),
    );
    const page = await provider.search("insulin resistance", { offset: 0, count: 10, signal });
    expect(page.results[0]).toMatchObject({ url: "https://pubmed.ncbi.nlm.nih.gov/42803380/", title: "The Insulin Resistance Mosaic", authors: ["James DE", "Smith A"], venue: "Diabetes care", preprint: false });
    expect(page.results[1]).toMatchObject({ url: "https://doi.org/10.1101/2026.01.01", preprint: true });
  });
});

describe("news, technical and government providers", () => {
  it("GDELT: reports its plain-text rate limit as rate limited, and crawl time is not a publication date", async () => {
    const limited = gdeltProvider(textFetch("Please limit requests to one every 5 seconds", 429), noWait);
    await expect(limited.search("inflation", { offset: 0, count: 10, signal })).rejects.toMatchObject({ code: "rate_limited" });
    const ok = gdeltProvider(textFetch(JSON.stringify({ articles: [{ url: "https://www.reuters.com/a", title: "Inflation cools", seendate: "20261020T123000Z" }] })), noWait);
    const page = await ok.search("inflation interest rates", { offset: 0, count: 10, signal });
    expect(page.results[0]).toEqual({ title: "Inflation cools", url: "https://www.reuters.com/a", seenAt: "2026-10-20T12:30:00Z" });
    expect(page.results[0].publishedAt).toBeUndefined();
  });

  it("Hacker News: returns the linked article, with points as a hint", async () => {
    const page = await hackerNewsProvider(jsonFetch(() => ({ nbPages: 3, hits: [{ title: "Why asynchronous Rust doesn't work", url: "https://theta.eu.org/2021/03/08/async-rust-2.html", points: 603, created_at: "2021-03-10T02:16:55Z", objectID: "1" }, { title: "Ask HN: async?", objectID: "2", points: 7 }] }))).search("async rust", { offset: 0, count: 10, signal });
    expect(page.results[0]).toMatchObject({ url: "https://theta.eu.org/2021/03/08/async-rust-2.html", hints: ["603 points on Hacker News"] });
    expect(page.results[0].publishedAt).toBeUndefined();
    expect(page.results[1].url).toBe("https://news.ycombinator.com/item?id=2");
  });

  it("GitHub: an anonymous rate limit is reported as such, not as a bad key", async () => {
    const provider = gitHubProvider(jsonFetch(() => ({ message: "API rate limit exceeded" }), 403, { "x-ratelimit-remaining": "0" }));
    await expect(provider.search("rust async", { offset: 0, count: 10, signal })).rejects.toMatchObject({ code: "rate_limited" });
    const ok = await gitHubProvider(jsonFetch(() => ({ total_count: 1, items: [{ full_name: "tokio-rs/tokio", html_url: "https://github.com/tokio-rs/tokio", description: "A runtime", stargazers_count: 28500, language: "Rust" }] }))).search("rust async", { offset: 0, count: 10, signal });
    expect(ok.results[0]).toMatchObject({ title: "tokio-rs/tokio", hints: ["29k GitHub stars", "Written in Rust"] });
  });

  it("Stack Exchange: skips unanswered noise and keeps the real question date", async () => {
    const page = await stackExchangeProvider(
      jsonFetch(() => ({ has_more: false, items: [{ title: "How to call Rust async from Python?", link: "https://stackoverflow.com/q/1", is_answered: true, score: 5, accepted_answer_id: 2, creation_date: 1593331675, tags: ["rust", "python"] }, { title: "help", link: "https://stackoverflow.com/q/3", is_answered: false, score: -1 }] })),
    ).search("rust async", { offset: 0, count: 10, signal });
    expect(page.results).toHaveLength(1);
    expect(page.results[0]).toMatchObject({ publishedAt: "2020-06-28T08:07:55.000Z", hints: ["Has an accepted answer", "Score 5"] });
  });

  it("Federal Register and World Bank: primary documents with their own dates", async () => {
    const fr = await federalRegisterProvider(jsonFetch(() => ({ total_pages: 5, results: [{ title: "Inflation adjustments", html_url: "https://www.federalregister.gov/d/2026-1", abstract: "Adjusts penalties.", publication_date: "2026-01-15", type: "Rule", agencies: [{ name: "Treasury Department" }] }] }))).search("inflation", { offset: 0, count: 10, signal });
    expect(fr.results[0]).toMatchObject({ publishedAt: "2026-01-15", venue: "Federal Register rule · Treasury Department" });
    const wb = await worldBankProvider(
      jsonFetch(() => ({ total: 2, documents: { D1: { display_title: "Inflation,  growth", url: "http://documents.worldbank.org/curated/en/1/Inflation", docdt: "1996-02-29T00:00:00Z", docty: "Policy Research Working Paper", lang: "English", abstracts: { "cdata!": "The author reviews\n   the theory." } }, facets: {} } })),
    ).search("inflation growth", { offset: 0, count: 10, signal });
    expect(wb.results).toEqual([{ title: "Inflation, growth", url: "https://documents.worldbank.org/curated/en/1/Inflation", abstract: "The author reviews the theory.", publishedAt: "1996-02-29T00:00:00Z", venue: "World Bank · Policy Research Working Paper" }]);
  });
});

// --- Federated search ------------------------------------------------------------------

function fakeProvider(id: SearchProviderId, behaviour: (query: string, signal: AbortSignal) => Promise<SearchPage> | SearchPage, keyless = true): SearchProvider & { calls: number } {
  const provider = {
    id,
    label: id,
    scope: "web" as const,
    kind: id === "wikipedia" ? ("encyclopedia" as const) : id === "openalex" || id === "arxiv" ? ("scholarly" as const) : id === "gdelt" ? ("news" as const) : ("web" as const),
    keyless,
    calls: 0,
    async search(query: string, options: { signal: AbortSignal }) {
      provider.calls++;
      return behaviour(query, options.signal);
    },
  };
  return provider;
}

const page = (results: RawResult[]): SearchPage => ({ results, nextOffset: null });

describe("federated search", () => {
  const question = "How does quantum entanglement work?";
  const scholarly = fakeProvider("openalex", () => page([{ title: "Quantum entanglement", url: "https://doi.org/10.1103/revmodphys.81.865", venue: "Reviews of Modern Physics", citedBy: 9000 }]));
  const preprints = fakeProvider("arxiv", () => page([{ title: "Entanglement in quantum many-body systems", url: "https://arxiv.org/abs/0703044", preprint: true }]));
  const web = fakeProvider("brave", () => page([{ title: "What is quantum entanglement?", url: "https://www.quantamagazine.org/entanglement" }, { title: "Quantum entanglement explained", url: "https://physics.mit.edu/entanglement" }]), false);
  const wikipedia = fakeProvider("wikipedia", () => page([{ title: "Quantum entanglement", url: "https://en.wikipedia.org/wiki/Quantum_entanglement", snippet: "quantum entanglement" }]));

  it("returns sources from several unrelated domains, with no Wikipedia required", async () => {
    const result = await federatedSearch(question, [web, scholarly, preprints], { signal, cache: null, now: NOW });
    expect(result.failed).toBe(false);
    expect(new Set(result.results.map((r) => r.domain)).size).toBeGreaterThanOrEqual(4);
    expect(result.results.some((r) => r.domain.endsWith("wikipedia.org"))).toBe(false);
    expect(result.outcomes.map((o) => o.status)).toEqual(["ok", "ok", "ok"]);
    expect(result.outcomes[0].queries).toHaveLength(2);
  });

  it("includes Wikipedia alongside other sources without letting it dominate", async () => {
    const result = await federatedSearch(question, [web, scholarly, preprints, wikipedia], { signal, cache: null, now: NOW });
    const wiki = result.results.filter((r) => r.domain.endsWith("wikipedia.org"));
    expect(wiki).toHaveLength(1);
    expect(result.results[0].domain.endsWith("wikipedia.org")).toBe(false);
  });

  it("reports timeouts and failures per provider while the others still answer", async () => {
    const hanging = fakeProvider("arxiv", (_q, s) => new Promise<SearchPage>((_, reject) => s.addEventListener("abort", () => reject(s.reason), { once: true })));
    const limited = fakeProvider("wikipedia", () => {
      throw new IngestError("rate_limited", "Wikipedia rate limit reached.", 429);
    });
    const flaky = fakeProvider("brave", () => {
      throw new TypeError("fetch failed");
    }, false);
    const result = await federatedSearch(question, [flaky, scholarly, hanging, limited], { signal, cache: null, timeoutMs: 80, now: NOW });
    const status = Object.fromEntries(result.outcomes.map((o) => [o.id, o.status]));
    expect(status).toEqual({ brave: "failed", openalex: "ok", arxiv: "timeout", wikipedia: "rate_limited" });
    // Rate limits are not retried.
    expect(limited.calls).toBe(1);
    expect(result.failed).toBe(false);
    expect(result.results.length).toBeGreaterThan(0);
  });

  it("retries a transient network error once", async () => {
    let calls = 0;
    const flaky = fakeProvider("brave", () => {
      calls++;
      if (calls === 1) throw new TypeError("fetch failed");
      return page([{ title: "Quantum entanglement explained", url: "https://physics.mit.edu/entanglement" }]);
    }, false);
    const result = await federatedSearch(question, [flaky], { signal, cache: null, now: NOW });
    expect(flaky.calls).toBe(3);
    expect(result.outcomes[0]).toMatchObject({ status: "ok", count: 2 });
  });

  it("distinguishes total failure from a successful search with few results", async () => {
    const down = fakeProvider("openalex", () => {
      throw new IngestError("http_error", "OpenAlex returned an error (HTTP 500).", 502);
    });
    const failed = await federatedSearch(question, [down], { signal, cache: null, now: NOW });
    expect(failed.failed).toBe(true);
    const empty = await federatedSearch(question, [fakeProvider("openalex", () => page([]))], { signal, cache: null, now: NOW });
    expect(empty.failed).toBe(false);
    expect(empty.outcomes[0].status).toBe("empty");
  });

  it("skips keyless indexes that do not fit the topic, without calling them", async () => {
    const github = fakeProvider("github", () => page([]));
    const result = await federatedSearch("Why did the Treaty of Versailles contribute to World War II?", [github, scholarly], { signal, cache: null, now: NOW });
    expect(github.calls).toBe(0);
    expect(result.outcomes.find((o) => o.id === "github")?.status).toBe("skipped");
  });

  it("caches provider pages and streams progress as each provider finishes", async () => {
    const counted = fakeProvider("openalex", () => page([{ title: "Quantum entanglement", url: "https://doi.org/10.1/x" }]));
    const cache = new TtlCache<SearchPage>(10, 60_000);
    const progress: string[] = [];
    await federatedSearch(question, [counted, web], { signal, cache, now: NOW, onProgress: (o, results) => progress.push(`${o.id}:${results.length}`) });
    await federatedSearch(question, [counted], { signal, cache, now: NOW });
    expect(counted.calls).toBe(1);
    expect(progress).toHaveLength(2);
    expect(Number(progress[1].split(":")[1])).toBeGreaterThanOrEqual(Number(progress[0].split(":")[1]));
  });

  it("drops results already in the workspace when research is run again", async () => {
    const result = await federatedSearch(question, [scholarly, web], { signal, cache: null, now: NOW, exclude: new Set(["doi:10.1103/revmodphys.81.865"]) });
    expect(result.results.some((r) => r.doi === "10.1103/revmodphys.81.865")).toBe(false);
  });
});

describe("cache", () => {
  it("expires entries and evicts the least recently used", () => {
    let now = 0;
    const cache = new TtlCache<number>(2, 100, () => now);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    now = 200;
    expect(cache.get("a")).toBeUndefined();
  });
});
