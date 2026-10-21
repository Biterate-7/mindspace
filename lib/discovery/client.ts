import type { DiscoveryConfig, IngestedArticle, IngestErrorCode, IngestStage, SearchResult, SearchScope } from "@/types/research";

/**
 * Browser-side calls to the Discovery API. The browser never talks to search providers
 * or arbitrary websites directly: every external request goes through these endpoints.
 */

export class ApiError extends Error {
  readonly code: IngestErrorCode | "bad_request" | "not_configured";
  constructor(code: ApiError["code"], message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

type ErrorBody = { ok: false; error?: { code?: string; message?: string } };

async function parseError(response: Response, fallback: string): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorBody;
    return new ApiError((body.error?.code as ApiError["code"]) ?? "network", body.error?.message ?? fallback);
  } catch {
    return new ApiError(response.status === 429 ? "rate_limited" : "network", fallback);
  }
}

function offline(error: unknown): ApiError {
  if ((error as Error)?.name === "AbortError") return new ApiError("cancelled", "Cancelled.");
  return new ApiError("network", "Could not reach the Mindspace server. Check that it is running and you are online.");
}

export async function fetchConfig(signal?: AbortSignal): Promise<DiscoveryConfig> {
  let response: Response;
  try {
    response = await fetch("/api/discovery/config", { signal, cache: "no-store" });
  } catch (error) {
    throw offline(error);
  }
  if (!response.ok) throw await parseError(response, "Could not load Discovery settings.");
  const body = (await response.json()) as { config: DiscoveryConfig };
  return body.config;
}

export interface SearchResponse {
  provider: { id: string; label: string };
  scope: SearchScope;
  query: string;
  results: SearchResult[];
  nextOffset: number | null;
}

export async function searchSources(query: string, scope: SearchScope, offset: number, exclude: string[], signal?: AbortSignal): Promise<SearchResponse> {
  let response: Response;
  try {
    response = await fetch("/api/discovery/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, scope, offset, exclude: exclude.slice(0, 400) }),
      signal,
    });
  } catch (error) {
    throw offline(error);
  }
  if (!response.ok) throw await parseError(response, "Search failed.");
  return (await response.json()) as SearchResponse;
}

/** Imports a page through the server, reporting each real stage as it happens. */
export async function ingestSource(url: string, onStage: (stage: IngestStage) => void, signal?: AbortSignal): Promise<IngestedArticle> {
  let response: Response;
  try {
    response = await fetch("/api/discovery/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), signal });
  } catch (error) {
    throw offline(error);
  }
  if (!response.ok || !response.body) throw await parseError(response, "Import failed.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line) continue;
        const event = JSON.parse(line) as { stage?: IngestStage; result?: IngestedArticle; error?: { code: ApiError["code"]; message: string } };
        if (event.stage) onStage(event.stage);
        if (event.result) return event.result;
        if (event.error) throw new ApiError(event.error.code, event.error.message);
      }
      if (done) break;
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw offline(error);
  }
  throw new ApiError("network", "The server closed the connection before the import finished.");
}
