import { FACET_LABELS } from "@/lib/discovery/plan";
import { federatedSearch } from "@/lib/discovery/server/federated";
import { jsonError, rateLimited, readJsonBody } from "@/lib/discovery/server/http";
import { clientKey, RateLimiter } from "@/lib/discovery/server/rateLimit";
import { providersFromEnv } from "@/lib/discovery/server/search";

const limiter = new RateLimiter(20, 60_000);

/**
 * Federated search across every relevant provider. POST { query, offset?, exclude? }
 * (`offset` is the page of results: 0, then the `nextOffset` of the previous answer.)
 *
 * Streams newline-delimited JSON so the client can show providers finishing one by one:
 *   {"type":"plan",…} {"type":"progress","outcome":…,"results":[…]}… then {"type":"done",…} or {"type":"error",…}
 */
export async function POST(request: Request) {
  const wait = limiter.take(clientKey(request.headers));
  if (wait > 0) return rateLimited(wait);

  const body = await readJsonBody(request, 64 * 1024);
  const query = typeof body?.query === "string" ? body.query.replace(/\s+/g, " ").trim() : "";
  if (!query || query.length > 400) return jsonError("bad_request", "Enter a search question of up to 400 characters.", 400);
  const page = typeof body?.offset === "number" && Number.isInteger(body.offset) && body.offset >= 0 && body.offset <= 10 ? body.offset : 0;
  const exclude = new Set(Array.isArray(body?.exclude) ? body.exclude.filter((k): k is string => typeof k === "string").slice(0, 800) : []);

  const { all } = providersFromEnv();
  if (all.length === 0) return jsonError("not_configured", "Every search provider is disabled on this server (DISCOVERY_DISABLE_PROVIDERS).", 503);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        } catch {
          // The client went away; nothing left to tell it.
        }
      };
      try {
        send({ type: "plan", providers: all.map((p) => ({ id: p.id, label: p.label })) });
        const result = await federatedSearch(query, all, {
          signal: request.signal,
          page,
          exclude,
          onProgress: (outcome, results) => send({ type: "progress", outcome, results }),
        });
        const summary = { facets: result.plan.facets.map((f) => FACET_LABELS[f]), queries: [...new Set(result.outcomes.flatMap((o) => o.queries))] };
        if (result.failed) {
          send({ type: "error", error: { code: "network", message: "Every search provider failed. Check the server's internet connection and the provider list below." }, outcomes: result.outcomes, ...summary });
        } else {
          send({ type: "done", query, results: result.results, outcomes: result.outcomes, nextOffset: result.nextOffset, ...summary });
        }
      } catch {
        send({ type: "error", error: { code: "network", message: "Search failed unexpectedly. Try again." } });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a disconnect.
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
