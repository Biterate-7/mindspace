import type { DiscoveryConfig, IngestedArticle, IngestErrorCode, IngestStage, ProviderInfo, ProviderOutcome, SearchResult } from "@/types/research";

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

/**
 * Reads a newline-delimited JSON stream, handing each event to `onEvent`. Returns the first
 * value `onEvent` returns (the final event); errors thrown by `onEvent` propagate.
 */
async function readEvents<T>(response: Response, onEvent: (event: Record<string, unknown>) => T | undefined, closedMessage: string): Promise<T> {
  if (!response.body) throw new ApiError("network", closedMessage);
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
        const result = onEvent(JSON.parse(line) as Record<string, unknown>);
        if (result !== undefined) return result;
      }
      if (done) break;
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw offline(error);
  }
  throw new ApiError("network", closedMessage);
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  outcomes: ProviderOutcome[];
  nextOffset: number | null;
  /** Topic facets the server detected, as labels. */
  facets: string[];
  /** Every query the server generated and sent. */
  queries: string[];
}

export interface SearchProgress {
  providers?: ProviderInfo[];
  outcome?: ProviderOutcome;
  results?: SearchResult[];
}

/** Federated search; `onProgress` sees each provider finish, with the ranked results so far. */
export async function searchSources(query: string, offset: number, exclude: string[], onProgress: (progress: SearchProgress) => void, signal?: AbortSignal): Promise<SearchResponse> {
  let response: Response;
  try {
    response = await fetch("/api/discovery/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, offset, exclude: exclude.slice(0, 800) }),
      signal,
    });
  } catch (error) {
    throw offline(error);
  }
  if (!response.ok) throw await parseError(response, "Search failed.");
  return readEvents<SearchResponse>(
    response,
    (event) => {
      if (event.type === "plan") onProgress({ providers: event.providers as ProviderInfo[] });
      else if (event.type === "progress") onProgress({ outcome: event.outcome as ProviderOutcome, results: event.results as SearchResult[] });
      else if (event.type === "done") return event as unknown as SearchResponse;
      else if (event.type === "error") {
        for (const outcome of Array.isArray(event.outcomes) ? (event.outcomes as ProviderOutcome[]) : []) onProgress({ outcome });
        const failure = event.error as { code: ApiError["code"]; message: string };
        throw new ApiError(failure.code, failure.message);
      }
      return undefined;
    },
    "The server closed the connection before the search finished.",
  );
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
  return readEvents<IngestedArticle>(
    response,
    (event) => {
      if (event.stage) onStage(event.stage as IngestStage);
      if (event.result) return event.result as IngestedArticle;
      if (event.error) {
        const failure = event.error as { code: ApiError["code"]; message: string };
        throw new ApiError(failure.code, failure.message);
      }
      return undefined;
    },
    "The server closed the connection before the import finished.",
  );
}
