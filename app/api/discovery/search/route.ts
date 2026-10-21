import type { SearchScope } from "@/types/research";
import { rankResults } from "@/lib/discovery/rank";
import { IngestError } from "@/lib/discovery/server/errors";
import { errorResponse, jsonError, jsonOk, rateLimited, readJsonBody } from "@/lib/discovery/server/http";
import { clientKey, RateLimiter } from "@/lib/discovery/server/rateLimit";
import { providersFromEnv } from "@/lib/discovery/server/search";

const limiter = new RateLimiter(20, 60_000);
const PAGE_SIZE = 10;

/** Web (or encyclopedia) search. POST { query, scope?, offset?, exclude? } */
export async function POST(request: Request) {
  const wait = limiter.take(clientKey(request.headers));
  if (wait > 0) return rateLimited(wait);

  const body = await readJsonBody(request, 32 * 1024);
  const query = typeof body?.query === "string" ? body.query.replace(/\s+/g, " ").trim() : "";
  if (!query || query.length > 400) return jsonError("bad_request", "Enter a search question of up to 400 characters.", 400);
  const scope: SearchScope = body?.scope === "encyclopedia" ? "encyclopedia" : "web";
  const offset = typeof body?.offset === "number" && Number.isInteger(body.offset) && body.offset >= 0 && body.offset <= 200 ? body.offset : 0;
  const exclude = Array.isArray(body?.exclude) ? body.exclude.filter((k): k is string => typeof k === "string").slice(0, 400) : [];

  const providers = providersFromEnv();
  const provider = scope === "web" ? providers.web : providers.encyclopedia;
  if (!provider) {
    return jsonError(
      "not_configured",
      scope === "web" ? "Web search is not configured. Add BRAVE_SEARCH_API_KEY or TAVILY_API_KEY to the server environment." : "Encyclopedia search is disabled on this server.",
      503,
    );
  }

  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(12000)]);
    const page = await provider.search(query, { offset, count: PAGE_SIZE, signal });
    const results = rankResults(page.results, query, provider.id, offset, new Set(exclude));
    return jsonOk({ provider: { id: provider.id, label: provider.label }, scope, query, results, nextOffset: page.nextOffset });
  } catch (error) {
    if (error instanceof IngestError) return errorResponse(error);
    if ((error as Error)?.name === "TimeoutError" || (error as Error)?.name === "AbortError") {
      return jsonError("timeout", `${provider.label} took too long to answer. Try again.`, 504);
    }
    return jsonError("network", `Could not reach ${provider.label}. Check the server's internet connection.`, 502);
  }
}
