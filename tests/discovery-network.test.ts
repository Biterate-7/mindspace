import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ingestUrl } from "@/lib/discovery/server/ingest";
import { isPublicAddress, parseIPv6, resolvePublic, safeFetch, validateTargetUrl, type NetworkPolicy, type Resolver } from "@/lib/discovery/server/net";
import { isAllowedByRobots } from "@/lib/discovery/server/robots";
import { RateLimiter } from "@/lib/discovery/server/rateLimit";

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}

function syncCode(run: () => unknown): string {
  try {
    run();
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? "unknown";
  }
}

describe("IP classification", () => {
  it.each([
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:0001::1",
    "2001:db8::1",
    "2001:0:4136:e378::1",
  ])("blocks non-public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.215.14", "172.32.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"])("allows public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it("parses IPv6 forms, including embedded IPv4 and zone ids", () => {
    expect(parseIPv6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("::ffff:1.2.3.4")).toEqual([0, 0, 0, 0, 0, 0xffff, 0x0102, 0x0304]);
    expect(parseIPv6("fe80::1%eth0")).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(parseIPv6("1:2:3:4:5:6:7:8:9")).toBeNull();
    expect(parseIPv6("not-an-ip")).toBeNull();
  });
});

describe("URL validation", () => {
  it.each([
    ["ftp://example.com/file", "blocked_url"],
    ["file:///etc/passwd", "blocked_url"],
    ["javascript:alert(1)", "blocked_url"],
    ["https://user:pass@example.com/", "blocked_url"],
    ["https://example.com:8443/", "blocked_url"],
    ["http://example.com:22/", "blocked_url"],
    ["http://localhost/", "blocked_url"],
    ["http://app.localhost/", "blocked_url"],
    ["http://printer.local/", "blocked_url"],
    ["http://metadata.google.internal/computeMetadata/v1/", "blocked_url"],
    ["http://intranet/", "blocked_url"],
    ["http://127.0.0.1/", "blocked_url"],
    ["http://2130706433/", "blocked_url"],
    ["http://0x7f.1/", "blocked_url"],
    ["http://0177.0.0.1/", "blocked_url"],
    ["http://[::1]/", "blocked_url"],
    ["http://[::ffff:127.0.0.1]/", "blocked_url"],
    ["http://169.254.169.254/latest/meta-data/", "blocked_url"],
    ["not a url", "invalid_url"],
  ])("rejects %s", (url, code) => {
    expect(syncCode(() => validateTargetUrl(url))).toBe(code);
  });

  it("accepts ordinary public web addresses", () => {
    expect(validateTargetUrl("https://en.wikipedia.org/wiki/Treaty_of_Versailles").hostname).toBe("en.wikipedia.org");
    expect(validateTargetUrl("http://example.com:80/a?b=c").pathname).toBe("/a");
  });
});

describe("DNS checks", () => {
  const fake = (map: Record<string, string[]>): Resolver => async (host) => {
    const addresses = map[host];
    if (!addresses) throw new Error("ENOTFOUND");
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };

  it("refuses a host when any resolved address is private (split-horizon / rebinding)", async () => {
    const resolver = fake({ "evil.example": ["93.184.215.14", "10.0.0.7"], "rebind.example": ["127.0.0.1"], "good.example": ["93.184.215.14"] });
    expect(await codeOf(resolvePublic("evil.example", resolver))).toBe("blocked_url");
    expect(await codeOf(resolvePublic("rebind.example", resolver))).toBe("blocked_url");
    expect(await codeOf(resolvePublic("missing.example", resolver))).toBe("dns_failed");
    expect(await resolvePublic("good.example", resolver)).toHaveLength(1);
  });

  it("never connects when the hostname resolves to a private address", async () => {
    let connected = false;
    const server = http.createServer((_req, res) => {
      connected = true;
      res.end("secret");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const loopbackResolver: Resolver = async () => [{ address: "127.0.0.1", family: 4 }];
    // Even with the port allowed, the default address policy rejects loopback.
    const policy: NetworkPolicy = { isAllowedAddress: isPublicAddress, allowedPorts: null };
    expect(await codeOf(safeFetch(`http://internal-looking.example:${port}/`, { resolver: loopbackResolver, policy }))).toBe("blocked_url");
    expect(connected).toBe(false);
    server.close();
  });
});

describe("safe fetching and ingestion (local test server)", () => {
  let server: http.Server;
  let base: string;
  // Admit the loopback test server only; everything else keeps the production rules.
  const policy: NetworkPolicy = { isAllowedAddress: (ip) => ip === "127.0.0.1" || isPublicAddress(ip), allowedPorts: null };
  const article = `<!doctype html><html lang="en"><head><title>Test article | Example</title>
    <meta property="og:site_name" content="Example Times"><link rel="canonical" href="/canonical-article">
    <meta property="article:published_time" content="2023-05-04T10:00:00Z"></head><body>
    <nav>Home · World · Sport</nav><div class="cookie-banner">We use cookies. Accept all?</div>
    <article><h1>Rivers and cities</h1>${"<p>Rivers shaped where early cities grew, because fresh water, trade routes and fertile soil were all close at hand for farmers and merchants alike.</p>".repeat(6)}</article>
    <script>window.alert("never run")</script><footer>© Example</footer></body></html>`;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? "/";
      if (url === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("User-agent: *\nDisallow: /private\nAllow: /private/open\n");
      } else if (url === "/article" || url === "/private/open") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(article);
      } else if (url === "/gzip") {
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        res.end(zlib.gzipSync(article));
      } else if (url === "/redirect-ok") {
        res.writeHead(302, { location: "/article" });
        res.end();
      } else if (url === "/redirect-metadata") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      } else if (url === "/redirect-localhost") {
        res.writeHead(301, { location: `http://localhost:${(server.address() as AddressInfo).port}/article` });
        res.end();
      } else if (url === "/loop") {
        res.writeHead(302, { location: "/loop2" });
        res.end();
      } else if (url === "/loop2") {
        res.writeHead(302, { location: "/loop" });
        res.end();
      } else if (url === "/big") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("x".repeat(300_000));
      } else if (url === "/slow") {
        setTimeout(() => res.end("late"), 2000);
      } else if (url === "/pdf") {
        res.writeHead(200, { "content-type": "application/pdf" });
        res.end("%PDF-1.4");
      } else if (url === "/forbidden") {
        res.writeHead(403);
        res.end();
      } else if (url === "/empty") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html><body><nav>Menu</nav><p>Short.</p></body></html>");
      } else if (url === "/paywall") {
        res.writeHead(200, { "content-type": "text/html" });
        res.end('<html><head><script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false}</script></head><body><article><p>Subscribe to read the rest of this story.</p></article></body></html>');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  it("extracts readable text and metadata, without navigation, cookie banners or scripts", async () => {
    const stages: string[] = [];
    const result = await ingestUrl(`${base}/article`, { policy, onStage: (s) => stages.push(s) });
    expect(stages).toEqual(["checking", "fetching", "extracting"]);
    expect(result.title).toContain("Test article");
    expect(result.text).toContain("Rivers shaped where early cities grew");
    expect(result.text).not.toMatch(/cookies|never run|Home · World|© Example/);
    expect(result.canonicalUrl).toBe(`${base}/canonical-article`);
    expect(result.publishedAt).toBe("2023-05-04T10:00:00.000Z");
    expect(result.siteName).toBe("Example Times");
  });

  it("decompresses gzip and follows safe redirects", async () => {
    expect((await ingestUrl(`${base}/gzip`, { policy, skipRobots: true })).text).toContain("fertile soil");
    const redirected = await safeFetch(`${base}/redirect-ok`, { policy });
    expect(redirected.status).toBe(200);
    expect(redirected.redirects).toEqual([`${base}/article`]);
  });

  it("validates every redirect hop", async () => {
    expect(await codeOf(safeFetch(`${base}/redirect-metadata`, { policy }))).toBe("blocked_url");
    expect(await codeOf(safeFetch(`${base}/redirect-localhost`, { policy }))).toBe("blocked_url");
    expect(await codeOf(safeFetch(`${base}/loop`, { policy }))).toBe("too_many_redirects");
  });

  it("enforces size limits and timeouts", async () => {
    expect(await codeOf(safeFetch(`${base}/big`, { policy, maxBytes: 100_000 }))).toBe("too_large");
    expect(await codeOf(safeFetch(`${base}/slow`, { policy, timeoutMs: 300 }))).toBe("timeout");
  });

  it("reports clear failures for unavailable, forbidden, unsupported, empty and paywalled pages", async () => {
    expect(await codeOf(ingestUrl(`${base}/missing`, { policy, skipRobots: true }))).toBe("not_found");
    expect(await codeOf(ingestUrl(`${base}/forbidden`, { policy, skipRobots: true }))).toBe("forbidden");
    expect(await codeOf(ingestUrl(`${base}/pdf`, { policy, skipRobots: true }))).toBe("unsupported_type");
    expect(await codeOf(ingestUrl(`${base}/empty`, { policy, skipRobots: true }))).toBe("no_content");
    expect(await codeOf(ingestUrl(`${base}/paywall`, { policy, skipRobots: true }))).toBe("paywalled");
  });

  it("honours robots.txt", async () => {
    expect(await codeOf(ingestUrl(`${base}/private/page`, { policy }))).toBe("robots_disallowed");
    expect(await codeOf(ingestUrl(`${base}/private/open`, { policy }))).toBe("ok");
  });

  it("cancels in-flight imports", async () => {
    const controller = new AbortController();
    const pending = safeFetch(`${base}/slow`, { policy, signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    expect(await codeOf(pending)).toBe("cancelled");
  });
});

describe("robots.txt matching", () => {
  const robots = `User-agent: *\nDisallow: /search\nDisallow: /*.pdf$\nAllow: /search/about\n\nUser-agent: MindspaceDiscovery\nDisallow: /no-tools\n`;
  it("applies the most specific group and the longest rule", () => {
    expect(isAllowedByRobots(robots, "/no-tools/page")).toBe(false);
    // Our own group exists, so the "*" rules do not apply to us.
    expect(isAllowedByRobots(robots, "/search?q=x")).toBe(true);
    expect(isAllowedByRobots(robots, "/search?q=x", "otherbot")).toBe(false);
    expect(isAllowedByRobots(robots, "/search/about", "otherbot")).toBe(true);
    expect(isAllowedByRobots(robots, "/files/report.pdf", "otherbot")).toBe(false);
    expect(isAllowedByRobots("User-agent: *\nDisallow:\n", "/anything")).toBe(true);
  });
});

describe("rate limiting", () => {
  it("allows a burst up to the limit, then asks the client to wait", () => {
    const limiter = new RateLimiter(3, 1000);
    expect([limiter.take("a", 0), limiter.take("a", 10), limiter.take("a", 20)]).toEqual([0, 0, 0]);
    expect(limiter.take("a", 30)).toBeGreaterThan(0);
    expect(limiter.take("b", 30)).toBe(0);
    expect(limiter.take("a", 1001)).toBe(0);
  });
});
