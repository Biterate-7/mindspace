import type { IngestErrorCode } from "@/types/research";
import { IngestError } from "./errors";

/** Shared response helpers for Discovery route handlers. */

const NO_STORE = { "Cache-Control": "no-store" };

export function jsonOk<T extends object>(body: T, status = 200): Response {
  return Response.json({ ok: true, ...body }, { status, headers: NO_STORE });
}

export function jsonError(code: IngestErrorCode | "bad_request" | "not_configured", message: string, status: number, extraHeaders: Record<string, string> = {}): Response {
  return Response.json({ ok: false, error: { code, message } }, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof IngestError) {
    const status = error.code === "rate_limited" ? 429 : error.code === "cancelled" ? 499 : error.httpStatus && error.httpStatus >= 500 ? 502 : 422;
    return jsonError(error.code, error.message, status);
  }
  return jsonError("network", "Something went wrong on the server. Try again.", 500);
}

/** Reads a small JSON object body. Returns null for anything malformed or oversized. */
export async function readJsonBody(request: Request, maxBytes = 16 * 1024): Promise<Record<string, unknown> | null> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("application/json")) return null;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  let text: string;
  try {
    text = await request.text();
  } catch {
    return null;
  }
  if (text.length > maxBytes) return null;
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function rateLimited(waitMs: number): Response {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  return jsonError("rate_limited", `Too many requests. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`, 429, { "Retry-After": String(seconds) });
}
