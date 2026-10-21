import { IngestError } from "@/lib/discovery/server/errors";
import { jsonError, rateLimited, readJsonBody } from "@/lib/discovery/server/http";
import { ingestUrl } from "@/lib/discovery/server/ingest";
import { clientKey, RateLimiter } from "@/lib/discovery/server/rateLimit";
import { MAX_URL_LENGTH } from "@/lib/discovery/url";

// Runs on the Node.js runtime (the default): it needs node:dns, node:http and zlib.

const limiter = new RateLimiter(40, 60_000);

/**
 * Imports one public page. POST { url }.
 * Streams newline-delimited JSON so the client can show real stages:
 *   {"stage":"checking"} {"stage":"fetching"} {"stage":"extracting"} then {"result":…} or {"error":…}
 */
export async function POST(request: Request) {
  const wait = limiter.take(clientKey(request.headers));
  if (wait > 0) return rateLimited(wait);

  const body = await readJsonBody(request);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url || url.length > MAX_URL_LENGTH) return jsonError("invalid_url", "Provide a web address to import.", 400);

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
        const article = await ingestUrl(url, { signal: request.signal, onStage: (stage) => send({ stage }) });
        send({ result: article });
      } catch (error) {
        const failure = error instanceof IngestError ? { code: error.code, message: error.message } : { code: "network", message: "The page could not be imported." };
        send({ error: failure });
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
