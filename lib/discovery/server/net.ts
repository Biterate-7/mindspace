import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import { IngestError } from "./errors";

/**
 * SSRF-hardened fetching for user-supplied URLs.
 *
 * - Only http/https on default ports, no embedded credentials, no internal host names.
 * - Every hostname is resolved up front and *all* addresses must be public; the socket
 *   is then pinned to a vetted address so DNS rebinding cannot swap it afterwards.
 * - Redirects are followed manually and each hop is validated the same way.
 * - Hard limits on time, compressed and decompressed size, and redirect count.
 */

export const USER_AGENT = "Mozilla/5.0 (compatible; MindspaceDiscovery/0.1; user-initiated research import)";

// --- IP classification -------------------------------------------------------

export function parseIPv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255) ? octets : null;
}

/** Parses an IPv6 address (optionally with an embedded IPv4 tail or zone id) into 8 hextets. */
export function parseIPv6(value: string): number[] | null {
  let text = value.replace(/^\[|\]$/g, "").toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  if (!/^[0-9a-f:.]+$/.test(text) || !text.includes(":")) return null;
  // An embedded IPv4 tail ("::ffff:1.2.3.4") stands for the last two hextets.
  let tail: number[] = [];
  if (text.includes(".")) {
    const lastColon = text.lastIndexOf(":");
    const v4 = parseIPv4(text.slice(lastColon + 1));
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    text = text.slice(0, lastColon + 1);
    if (!text.endsWith("::")) text = text.slice(0, -1);
  }
  const pieces = text.split("::");
  if (pieces.length > 2) return null;
  const groups = (part: string): number[] | null => {
    if (!part) return [];
    const out: number[] = [];
    for (const g of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = groups(pieces[0]);
  const rest = pieces.length === 2 ? groups(pieces[1]) : [];
  if (!head || !rest) return null;
  const total = head.length + rest.length + tail.length;
  if (pieces.length === 1) return total === 8 ? [...head, ...tail] : null;
  const missing = 8 - total;
  if (missing < 1) return null;
  return [...head, ...Array<number>(missing).fill(0), ...rest, ...tail];
}

function inV4(octets: number[], base: number[], bits: number): boolean {
  let remaining = bits;
  for (let i = 0; i < 4 && remaining > 0; i++) {
    const take = Math.min(8, remaining);
    const mask = (0xff << (8 - take)) & 0xff;
    if ((octets[i] & mask) !== (base[i] & mask)) return false;
    remaining -= take;
  }
  return true;
}

const V4_BLOCKED: Array<[number[], number]> = [
  [[0, 0, 0, 0], 8], // "this" network
  [[10, 0, 0, 0], 8], // private
  [[100, 64, 0, 0], 10], // carrier-grade NAT
  [[127, 0, 0, 0], 8], // loopback
  [[169, 254, 0, 0], 16], // link-local, cloud metadata
  [[172, 16, 0, 0], 12], // private
  [[192, 0, 0, 0], 24], // IETF protocol assignments
  [[192, 0, 2, 0], 24], // documentation
  [[192, 31, 196, 0], 24], // AS112
  [[192, 52, 193, 0], 24], // AMT
  [[192, 88, 99, 0], 24], // 6to4 relay
  [[192, 168, 0, 0], 16], // private
  [[192, 175, 48, 0], 24], // AS112
  [[198, 18, 0, 0], 15], // benchmarking
  [[198, 51, 100, 0], 24], // documentation
  [[203, 0, 113, 0], 24], // documentation
  [[224, 0, 0, 0], 4], // multicast
  [[240, 0, 0, 0], 4], // reserved + broadcast
];

export function isPublicIPv4(octets: number[]): boolean {
  return !V4_BLOCKED.some(([base, bits]) => inV4(octets, base, bits));
}

export function isPublicIPv6(h: number[]): boolean {
  const allZero = h.every((x) => x === 0);
  if (allZero) return false; // ::
  if (h.slice(0, 7).every((x) => x === 0) && h[7] === 1) return false; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the embedded address.
  if (h.slice(0, 5).every((x) => x === 0) && (h[5] === 0xffff || h[5] === 0)) {
    return isPublicIPv4([h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255]);
  }
  // NAT64 (64:ff9b::/96 and 64:ff9b:1::/48) embeds an IPv4 address.
  if (h[0] === 0x64 && h[1] === 0xff9b) return isPublicIPv4([h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255]);
  // 6to4 (2002::/16) embeds an IPv4 address in bits 16-47.
  if (h[0] === 0x2002) return isPublicIPv4([h[1] >> 8, h[1] & 255, h[2] >> 8, h[2] & 255]);
  if ((h[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((h[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((h[0] & 0xffc0) === 0xfec0) return false; // deprecated site-local fec0::/10
  if ((h[0] & 0xff00) === 0xff00) return false; // multicast
  if (h[0] === 0x2001 && h[1] === 0x0db8) return false; // documentation
  if (h[0] === 0x2001 && h[1] === 0) return false; // Teredo
  if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return false; // discard-only
  if (h[0] === 0x2001 && h[1] < 0x0200) return false; // IETF protocol assignments (2001::/23)
  return (h[0] & 0xe000) === 0x2000; // only global unicast 2000::/3 is reachable
}

/** True only for addresses that are routable on the public internet. */
export function isPublicAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return isPublicIPv4(v4);
  const v6 = parseIPv6(address);
  if (v6) return isPublicIPv6(v6);
  return false;
}

// --- URL validation -------------------------------------------------------------

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".localdomain", ".internal", ".intranet", ".lan", ".home", ".corp", ".private", ".home.arpa", ".test", ".invalid", ".example", ".onion"];
const BLOCKED_HOSTS = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback", "metadata", "metadata.google.internal", "instance-data"]);

/**
 * What the fetcher may connect to. The default is the production policy: public
 * addresses on ports 80/443 only. Tests substitute a policy that also admits a
 * loopback test server; nothing user-controlled can change it.
 */
export interface NetworkPolicy {
  isAllowedAddress: (address: string) => boolean;
  /** Allowed explicit ports, or null to allow any. */
  allowedPorts: ReadonlySet<string> | null;
}

export const DEFAULT_POLICY: NetworkPolicy = { isAllowedAddress: isPublicAddress, allowedPorts: new Set(["80", "443"]) };

/**
 * Syntax-level checks: scheme, credentials, port, internal names and IP literals.
 * Throws IngestError with a user-facing message.
 */
export function validateTargetUrl(raw: string | URL, policy: NetworkPolicy = DEFAULT_POLICY): URL {
  let url: URL;
  try {
    url = typeof raw === "string" ? new URL(raw) : new URL(raw.href);
  } catch {
    throw new IngestError("invalid_url", "That is not a valid web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new IngestError("blocked_url", "Only http and https addresses can be imported.");
  if (url.username || url.password) throw new IngestError("blocked_url", "Addresses with embedded usernames or passwords are not allowed.");
  if (url.port && policy.allowedPorts && !policy.allowedPorts.has(url.port)) throw new IngestError("blocked_url", "Only standard web ports (80 and 443) are allowed.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new IngestError("invalid_url", "That address has no host name.");
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new IngestError("blocked_url", "Local and internal network addresses cannot be imported.");
  }
  // The WHATWG parser already normalises decimal/hex/octal IPv4 forms (e.g. 0x7f.1 -> 127.0.0.1).
  const literal = host.startsWith("[") ? host.slice(1, -1) : host;
  if (parseIPv4(literal) || parseIPv6(literal)) {
    if (!policy.isAllowedAddress(literal)) throw new IngestError("blocked_url", "Private, loopback and reserved IP addresses cannot be imported.");
  } else if (!host.includes(".")) {
    throw new IngestError("blocked_url", "Single-label host names are internal and cannot be imported.");
  }
  return url;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: Resolver = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

/** Resolves a host and refuses it if *any* address is non-public (defeats split-horizon tricks). */
export async function resolvePublic(hostname: string, resolver: Resolver = systemResolver, policy: NetworkPolicy = DEFAULT_POLICY): Promise<ResolvedAddress[]> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (parseIPv4(host) || parseIPv6(host)) {
    if (!policy.isAllowedAddress(host)) throw new IngestError("blocked_url", "Private, loopback and reserved IP addresses cannot be imported.");
    return [{ address: host, family: parseIPv4(host) ? 4 : 6 }];
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolver(host);
  } catch {
    throw new IngestError("dns_failed", "The site's address could not be found. Check the URL.");
  }
  if (addresses.length === 0) throw new IngestError("dns_failed", "The site's address could not be found. Check the URL.");
  if (addresses.some((a) => !policy.isAllowedAddress(a.address))) {
    throw new IngestError("blocked_url", "That host resolves to a private or internal network address, so it cannot be imported.");
  }
  return addresses;
}

// --- Fetching ----------------------------------------------------------------------

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  accept?: string;
  signal?: AbortSignal;
  resolver?: Resolver;
  policy?: NetworkPolicy;
}

export interface SafeResponse {
  url: string;
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  redirects: string[];
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function pinnedLookup(address: ResolvedAddress): LookupFunction {
  return ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    if (options?.all) callback(null, [{ address: address.address, family: address.family }]);
    else callback(null, address.address, address.family);
  }) as unknown as LookupFunction;
}

function decompress(encoding: string | undefined): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  const value = (encoding ?? "").toLowerCase().trim();
  if (value === "gzip" || value === "x-gzip") return zlib.createGunzip();
  if (value === "deflate") return zlib.createInflate();
  if (value === "br") return zlib.createBrotliDecompress();
  return null;
}

async function requestOnce(url: URL, address: ResolvedAddress, options: Required<Pick<SafeFetchOptions, "maxBytes" | "accept">>, deadline: AbortSignal): Promise<SafeResponse> {
  const transport = url.protocol === "https:" ? https : http;
  return new Promise<SafeResponse>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "GET",
        lookup: pinnedLookup(address),
        headers: {
          "User-Agent": USER_AGENT,
          Accept: options.accept,
          "Accept-Language": "en;q=1, *;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
        },
        signal: deadline,
        // Never reuse sockets across hosts: each request is pinned to its own vetted address.
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (REDIRECT_CODES.has(status)) {
          res.resume();
          resolve({ url: url.href, status, headers: res.headers, body: Buffer.alloc(0), redirects: [] });
          return;
        }
        const declared = Number(res.headers["content-length"]);
        if (Number.isFinite(declared) && declared > options.maxBytes) {
          res.destroy();
          reject(new IngestError("too_large", "The page is too large to import."));
          return;
        }
        const decoder = decompress(res.headers["content-encoding"] as string | undefined);
        const stream: NodeJS.ReadableStream = decoder ? res.pipe(decoder) : res;
        const chunks: Buffer[] = [];
        let total = 0;
        let raw = 0;
        res.on("data", (chunk: Buffer) => {
          raw += chunk.length;
          if (raw > options.maxBytes) res.destroy(new IngestError("too_large", "The page is too large to import."));
        });
        stream.on("data", (chunk: Buffer) => {
          total += chunk.length;
          // Decompressed size is capped too, so compression bombs cannot exhaust memory.
          if (total > options.maxBytes * 4) {
            res.destroy(new IngestError("too_large", "The page is too large to import."));
            return;
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ url: url.href, status, headers: res.headers, body: Buffer.concat(chunks), redirects: [] }));
        stream.on("error", (error) => reject(error));
        res.on("error", (error) => reject(error));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function normalizeNetworkError(error: unknown, deadline: AbortSignal, external?: AbortSignal): IngestError {
  if (error instanceof IngestError) return error;
  if (external?.aborted) return new IngestError("cancelled", "The import was cancelled.");
  if (deadline.aborted) return new IngestError("timeout", "The site took too long to respond.");
  const code = (error as NodeJS.ErrnoException)?.code ?? "";
  if (/CERT|SSL|TLS/i.test(code)) return new IngestError("network", "The site's security certificate could not be verified.");
  if (code === "ECONNREFUSED") return new IngestError("network", "The site refused the connection.");
  if (code === "ECONNRESET" || code === "EPIPE") return new IngestError("network", "The connection was interrupted.");
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return new IngestError("dns_failed", "The site's address could not be found.");
  if (code === "ABORT_ERR") return new IngestError("timeout", "The site took too long to respond.");
  if (code.startsWith("HPE_")) return new IngestError("network", "The site sent a malformed response.");
  return new IngestError("network", "The page could not be reached.");
}

/** Fetches a public URL with SSRF protections. Redirect targets are validated hop by hop. */
export async function safeFetch(input: string | URL, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxBytes = options.maxBytes ?? 4 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;
  const accept = options.accept ?? "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.1";
  const timeout = AbortSignal.timeout(timeoutMs);
  const deadline = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const redirects: string[] = [];
  const policy = options.policy ?? DEFAULT_POLICY;
  let url = validateTargetUrl(input, policy);
  const visited = new Set<string>([url.href]);

  for (let hop = 0; ; hop++) {
    try {
      const addresses = await resolvePublic(url.hostname, options.resolver, policy);
      // Prefer IPv4 for broad compatibility; all addresses were vetted anyway.
      const address = addresses.find((a) => a.family === 4) ?? addresses[0];
      const response = await requestOnce(url, address, { maxBytes, accept }, deadline);
      if (!REDIRECT_CODES.has(response.status)) return { ...response, redirects };
      const location = response.headers.location;
      if (!location) return { ...response, redirects };
      if (hop >= maxRedirects) throw new IngestError("too_many_redirects", "The page redirected too many times.");
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new IngestError("invalid_url", "The page redirected to an invalid address.");
      }
      next = validateTargetUrl(next, policy);
      if (visited.has(next.href)) throw new IngestError("too_many_redirects", "The page redirects in a loop.");
      visited.add(next.href);
      redirects.push(next.href);
      url = next;
    } catch (error) {
      throw normalizeNetworkError(error, timeout, options.signal);
    }
  }
}

/** Lower-cased media type without parameters. */
export function mediaType(headers: http.IncomingHttpHeaders): string {
  const value = headers["content-type"];
  return (Array.isArray(value) ? value[0] : value ?? "").split(";")[0].trim().toLowerCase();
}

export function charsetOf(headers: http.IncomingHttpHeaders): string | undefined {
  const value = headers["content-type"];
  const match = (Array.isArray(value) ? value[0] : value ?? "").match(/charset\s*=\s*"?([\w.:-]+)"?/i);
  return match?.[1]?.toLowerCase();
}
