import { IngestError } from "./errors";
import { safeFetch, type SafeFetchOptions } from "./net";

/**
 * robots.txt support (RFC 9309): the most specific matching group applies, the longest
 * matching rule wins, and Allow beats Disallow on a tie. Discovery identifies itself as
 * "MindspaceDiscovery" and otherwise follows the "*" group.
 */

export const ROBOTS_TOKEN = "mindspacediscovery";

interface Rule {
  allow: boolean;
  pattern: string;
}

interface Group {
  agents: string[];
  rules: Rule[];
}

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" || field === "disallow") {
      // An empty Disallow means "allow everything" and adds no rule.
      if (value) current.rules.push({ allow: field === "allow", pattern: value });
    }
  }
  return groups;
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

function normalizePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Whether `pathWithQuery` may be fetched by `token` under these robots rules. */
export function isAllowedByRobots(text: string, pathWithQuery: string, token = ROBOTS_TOKEN): boolean {
  const groups = parseRobots(text);
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const applicable = own.length > 0 ? own : groups.filter((g) => g.agents.includes("*"));
  if (applicable.length === 0) return true;
  const rules = applicable.flatMap((g) => g.rules);
  const path = normalizePath(pathWithQuery || "/");
  let best: Rule | null = null;
  let bestLength = -1;
  for (const rule of rules) {
    const pattern = normalizePath(rule.pattern);
    if (!patternToRegExp(pattern).test(path)) continue;
    const length = pattern.length;
    if (length > bestLength || (length === bestLength && rule.allow && best && !best.allow)) {
      best = rule;
      bestLength = length;
    }
  }
  return best ? best.allow : true;
}

const cache = new Map<string, { text: string | null; at: number }>();
const CACHE_MS = 10 * 60 * 1000;

/**
 * Throws IngestError("robots_disallowed") when the site's robots.txt forbids the page.
 * A missing robots.txt (4xx) allows everything; if it cannot be reached at all the
 * check is skipped because there are no rules to honour.
 */
export async function assertRobotsAllowed(url: URL, options: Pick<SafeFetchOptions, "signal" | "resolver" | "policy"> = {}): Promise<void> {
  const origin = url.origin;
  const now = Date.now();
  let entry = cache.get(origin);
  if (!entry || now - entry.at > CACHE_MS) {
    let text: string | null = null;
    try {
      const response = await safeFetch(`${origin}/robots.txt`, { ...options, timeoutMs: 6000, maxBytes: 512 * 1024, maxRedirects: 3, accept: "text/plain,*/*;q=0.1" });
      if (response.status >= 200 && response.status < 300) text = response.body.toString("utf8");
    } catch (error) {
      if (error instanceof IngestError && error.code === "cancelled") throw error;
      text = null;
    }
    entry = { text, at: now };
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    cache.set(origin, entry);
  }
  if (entry.text && !isAllowedByRobots(entry.text, url.pathname + url.search)) {
    throw new IngestError("robots_disallowed", "This site's robots.txt asks automated tools not to read this page. Open it yourself and paste the text if you have access.");
  }
}
