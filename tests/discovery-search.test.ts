import { describe, expect, it } from "vitest";
import { plainSnippet, rankResults, type RawResult } from "@/lib/discovery/rank";
import { braveProvider, providersFromEnv, publicConfig, tavilyProvider, wikipediaProvider } from "@/lib/discovery/server/search";
import { domainOf, parseHttpUrl, splitUrlInput, unsupportedFormat, urlKey } from "@/lib/discovery/url";

describe("URL normalisation", () => {
  it("treats the same page as one source regardless of tracking, case, www, fragments and slashes", () => {
    const key = urlKey("https://example.com/article");
    expect(urlKey("http://WWW.Example.com/article/")).toBe(key);
    expect(urlKey("https://example.com/article#section-2")).toBe(key);
    expect(urlKey("https://example.com/article?utm_source=x&utm_medium=y&fbclid=z")).toBe(key);
    expect(urlKey("https://example.com/article?b=2&a=1")).toBe(urlKey("https://example.com/article?a=1&b=2"));
    expect(urlKey("https://example.com/article?id=2")).not.toBe(key);
    expect(urlKey("https://en.m.wikipedia.org/wiki/X")).toBe(urlKey("https://en.wikipedia.org/wiki/X"));
  });

  it("parses user input, adding https:// when missing", () => {
    expect(parseHttpUrl("example.com/a")?.href).toBe("https://example.com/a");
    expect(parseHttpUrl("ftp://example.com")).toBeNull();
    expect(parseHttpUrl("hello world")).toBeNull();
    expect(domainOf("https://www.bbc.co.uk/news")).toBe("bbc.co.uk");
    expect(unsupportedFormat("https://example.com/report.PDF")).toBe("PDF");
  });

  it("splits pasted URL lists and reports what it could not read", () => {
    const { valid, invalid } = splitUrlInput("https://a.example/1\nhttps://a.example/1#again, https://b.example/2 https://c.example/3\nnot a url");
    expect(valid.map((u) => u.hostname)).toEqual(["a.example", "b.example", "c.example"]);
    expect(invalid).toEqual(["not a url"]);
  });
});

describe("search result ranking", () => {
  const raw: RawResult[] = [
    { title: "Treaty of <strong>Versailles</strong>", url: "https://en.wikipedia.org/wiki/Treaty_of_Versailles", snippet: "The treaty &amp; its terms…" },
    { title: "Treaty of Versailles", url: "https://en.wikipedia.org/wiki/Treaty_of_Versailles?utm_source=feed", snippet: "duplicate" },
    { title: "Same title, other URL", url: "https://history.example/a" },
    { title: "Same title, other URL", url: "https://history.example/b" },
    { title: "Reparations and the Weimar economy", url: "https://econ.example/reparations", snippet: "How reparations shaped Weimar Germany", publishedAt: "2021-02-03" },
    { title: "Unrelated cooking blog", url: "https://food.example/soup" },
    { title: "A PDF report", url: "https://archive.example/report.pdf" },
    { title: "Bad scheme", url: "javascript:alert(1)" },
    { title: "", url: "https://empty.example/" },
    { title: "Bad date", url: "https://dates.example/x", publishedAt: "yesterday-ish" },
  ];
  const results = rankResults(raw, "Why did the Versailles treaty reparations matter?", "brave");

  it("deduplicates by normalised URL and by same-domain title, and drops unusable entries", () => {
    expect(results.filter((r) => r.domain === "en.wikipedia.org")).toHaveLength(1);
    expect(results.filter((r) => r.domain === "history.example")).toHaveLength(1);
    expect(results.some((r) => r.url.startsWith("javascript"))).toBe(false);
    expect(results.some((r) => r.domain === "empty.example")).toBe(false);
  });

  it("keeps provider text but strips markup, and never invents dates", () => {
    const wiki = results.find((r) => r.domain === "en.wikipedia.org");
    expect(wiki?.title).toBe("Treaty of Versailles");
    expect(wiki?.snippet).toBe("The treaty & its terms…");
    expect(results.find((r) => r.domain === "econ.example")?.publishedAt).toBe("2021-02-03");
    expect(results.find((r) => r.domain === "dates.example")?.publishedAt).toBeUndefined();
    expect(results.find((r) => r.domain === "food.example")?.publishedAt).toBeUndefined();
  });

  it("ranks relevant results first and unsupported formats last", () => {
    const order = results.map((r) => r.domain);
    expect(order.indexOf("econ.example")).toBeLessThan(order.indexOf("food.example"));
    expect(results[results.length - 1].unsupported).toBe("PDF");
    expect(results.map((r) => r.rank)).toEqual(results.map((_, i) => i));
  });

  it("excludes results already shown when loading more", () => {
    const more = rankResults(raw, "versailles", "brave", 10, new Set([urlKey("https://en.wikipedia.org/wiki/Treaty_of_Versailles")]));
    expect(more.some((r) => r.domain === "en.wikipedia.org")).toBe(false);
    expect(more[0].rank).toBe(10);
  });

  it("decodes entities safely", () => {
    expect(plainSnippet("<b>A</b> &lt;b&gt; &#39;quoted&#39; &#x41;")).toBe("A <b> 'quoted' A");
  });
});

function fakeFetch(handler: (url: string, init?: RequestInit) => unknown, status = 200): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify(handler(String(input), init)), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

describe("search providers", () => {
  const signal = new AbortController().signal;

  it("Brave: sends the key as a header, maps results and pagination", async () => {
    let seen: { url: string; key: string | null } | null = null;
    const provider = braveProvider(
      "brave-key",
      fakeFetch((url, init) => {
        seen = { url, key: new Headers(init?.headers).get("X-Subscription-Token") };
        return { query: { more_results_available: true }, web: { results: [{ title: "T", url: "https://x.example/", description: "<strong>D</strong>", page_age: "2024-01-02T00:00:00" }] } };
      }),
    );
    const page = await provider.search("climate tipping points", { offset: 10, count: 10, signal });
    expect(seen!.key).toBe("brave-key");
    expect(seen!.url).toContain("q=climate+tipping+points");
    expect(seen!.url).toContain("offset=1");
    expect(page.results[0]).toEqual({ title: "T", url: "https://x.example/", snippet: "<strong>D</strong>", publishedAt: "2024-01-02T00:00:00" });
    expect(page.nextOffset).toBe(20);
  });

  it("Tavily: posts the query with a bearer token and skips results already shown", async () => {
    let auth: string | null = null;
    const provider = tavilyProvider(
      "tvly-key",
      fakeFetch((_url, init) => {
        auth = new Headers(init?.headers).get("Authorization");
        const body = JSON.parse(String(init?.body));
        return { results: Array.from({ length: body.max_results }, (_, i) => ({ title: `R${i}`, url: `https://r${i}.example/`, content: "c" })) };
      }),
    );
    const page = await provider.search("q", { offset: 10, count: 10, signal });
    expect(auth).toBe("Bearer tvly-key");
    expect(page.results.map((r) => r.title)).toEqual(Array.from({ length: 10 }, (_, i) => `R${i + 10}`));
    expect(page.nextOffset).toBeNull();
  });

  it("Wikipedia: builds article URLs and does not present edit times as publication dates", async () => {
    const provider = wikipediaProvider(fakeFetch(() => ({ continue: { sroffset: 10 }, query: { search: [{ title: "Treaty of Versailles", snippet: "…", timestamp: "2026-01-01T00:00:00Z" }] } })));
    const page = await provider.search("versailles", { offset: 0, count: 10, signal });
    expect(page.results[0].url).toBe("https://en.wikipedia.org/wiki/Treaty_of_Versailles");
    expect(page.results[0].publishedAt).toBeUndefined();
    expect(page.nextOffset).toBe(10);
  });

  it("reports rejected keys and rate limits as errors rather than empty results", async () => {
    const rejected = braveProvider("bad", fakeFetch(() => ({}), 401));
    await expect(rejected.search("q", { offset: 0, count: 10, signal })).rejects.toThrow(/rejected the API key/);
    const limited = braveProvider("k", fakeFetch(() => ({}), 429));
    await expect(limited.search("q", { offset: 0, count: 10, signal })).rejects.toThrow(/rate limit/);
  });

  it("chooses providers from the environment and never exposes keys", () => {
    expect(providersFromEnv({} as NodeJS.ProcessEnv).web).toBeNull();
    expect(providersFromEnv({} as NodeJS.ProcessEnv).encyclopedia?.id).toBe("wikipedia");
    expect(providersFromEnv({ BRAVE_SEARCH_API_KEY: "b" } as unknown as NodeJS.ProcessEnv).web?.id).toBe("brave");
    expect(providersFromEnv({ BRAVE_SEARCH_API_KEY: "b", TAVILY_API_KEY: "t", DISCOVERY_SEARCH_PROVIDER: "tavily" } as unknown as NodeJS.ProcessEnv).web?.id).toBe("tavily");
    expect(providersFromEnv({ DISCOVERY_DISABLE_WIKIPEDIA: "1" } as unknown as NodeJS.ProcessEnv).encyclopedia).toBeNull();
    const config = publicConfig({ BRAVE_SEARCH_API_KEY: "secret-brave-key", ANTHROPIC_API_KEY: "secret-anthropic" } as unknown as NodeJS.ProcessEnv);
    expect(JSON.stringify(config)).not.toContain("secret");
    expect(config.web).toEqual({ id: "brave", label: "Brave Search" });
  });
});
