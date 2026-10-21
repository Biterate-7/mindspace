/**
 * URL helpers shared by the browser and the server. These only look at syntax;
 * the server performs the real network safety checks (DNS, private ranges, redirects).
 */

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref_src|ref_url|_hsenc|_hsmi|yclid|spm|cmpid|ocid)$/i;

export const MAX_URL_LENGTH = 2048;

/** Parses user input into an http(s) URL, adding https:// when the scheme is missing. */
export function parseHttpUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname || (!url.hostname.includes(".") && !url.hostname.startsWith("["))) return null;
  return url;
}

/** Host without a leading "www.", for display and grouping. */
export function domainOf(url: string | URL): string {
  try {
    const host = (typeof url === "string" ? new URL(url) : url).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Normalised key for duplicate detection: lower-case host without www, no fragment,
 * no tracking parameters, sorted query, no trailing slash, scheme-insensitive.
 */
export function urlKey(raw: string | URL): string {
  let url: URL;
  try {
    url = typeof raw === "string" ? new URL(raw) : new URL(raw.href);
  } catch {
    return typeof raw === "string" ? raw.trim().toLowerCase() : "";
  }
  // Mobile Wikipedia (en.m.wikipedia.org) serves the same article as the desktop host.
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/\.m\.wikipedia\.org$/, ".wikipedia.org");
  const params = [...url.searchParams.entries()].filter(([name]) => !TRACKING_PARAMS.test(name)).sort(([a], [b]) => a.localeCompare(b));
  const query = params.length ? `?${params.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}` : "";
  let path = url.pathname.replace(/\/+$/, "");
  try {
    path = decodeURI(path);
  } catch {
    // Keep the raw path when it is not valid percent-encoding.
  }
  const port = url.port && url.port !== "80" && url.port !== "443" ? `:${url.port}` : "";
  return `${host}${port}${path}${query}`;
}

/** Splits pasted text (lines, spaces, commas) into candidate URLs, keeping order and dropping duplicates. */
export function splitUrlInput(text: string): { valid: URL[]; invalid: string[] } {
  // One entry per line (or comma); a line holding several URLs separated by spaces is split too,
  // while a line of plain words stays a single (invalid) entry.
  const parts = text
    .split(/[\n,]+/)
    .flatMap((line) => ((line.match(/https?:\/\//gi) ?? []).length > 1 ? line.split(/\s+/) : [line]))
    .map((p) => p.trim().replace(/^[<("']+|[>)"'.,;]+$/g, ""))
    .filter(Boolean);
  const valid: URL[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const url = parseHttpUrl(part);
    if (!url) {
      invalid.push(part);
      continue;
    }
    const key = urlKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    valid.push(url);
  }
  return { valid, invalid };
}

/** Extension-based guess for formats Discovery cannot read. */
export function unsupportedFormat(url: string): string | undefined {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const match = path.match(/\.(pdf|docx?|pptx?|xlsx?|zip|epub|mp3|mp4|mov|png|jpe?g|gif|webp)$/);
    return match ? match[1].toUpperCase() : undefined;
  } catch {
    return undefined;
  }
}
