import type { IngestErrorCode } from "@/types/research";

/** A failure with a stable code and a message that is safe to show to the user. */
export class IngestError extends Error {
  readonly code: IngestErrorCode;
  readonly httpStatus?: number;

  constructor(code: IngestErrorCode, message: string, httpStatus?: number) {
    super(message);
    this.name = "IngestError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function isIngestError(error: unknown): error is IngestError {
  return error instanceof IngestError;
}

/** Maps an upstream HTTP status to a user-facing failure. */
export function errorForStatus(status: number): IngestError {
  if (status === 401 || status === 403) return new IngestError("forbidden", "The site refused access. It may require a login, block automated readers, or be paywalled.", status);
  if (status === 402) return new IngestError("paywalled", "The page is behind a paywall.", status);
  if (status === 404 || status === 410) return new IngestError("not_found", "The page was not found (it may have moved or been deleted).", status);
  if (status === 429) return new IngestError("rate_limited", "The site is rate-limiting requests. Try again later.", status);
  if (status >= 500) return new IngestError("http_error", `The site is having trouble (HTTP ${status}). Try again later.`, status);
  return new IngestError("http_error", `The site responded with HTTP ${status}.`, status);
}
