/** Why a provider could not answer. Stable ids: they reach the user as advice. */
export type ProviderErrorCode =
  | "not-installed"
  | "unauthenticated"
  | "timeout"
  | "rate-limit"
  | "server"
  | "exit-code"
  | "invalid-output"
  | "invalid-content"
  | "refused"
  | "api";

/**
 * Transient failures worth retrying. Everything else — a refusal, a missing
 * binary, a bad key, malformed output, a chat reply where a document belongs —
 * repeats identically, so retrying it only burns time and money.
 */
const RETRYABLE_CODES: ReadonlySet<ProviderErrorCode> = new Set([
  "timeout",
  "rate-limit",
  "server",
]);

export interface ProviderErrorOptions {
  provider: string;
  code: ProviderErrorCode;
  message: string;
  /** Stderr, response body, or whatever helps the user fix it. */
  detail?: string | undefined;
  cause?: unknown;
}

/** Every provider failure is one of these: adapters never throw raw errors. */
export class ProviderError extends Error {
  readonly provider: string;
  readonly code: ProviderErrorCode;
  readonly detail: string | undefined;

  constructor(options: ProviderErrorOptions) {
    super(options.message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = "ProviderError";
    this.provider = options.provider;
    this.code = options.code;
    this.detail = options.detail;
  }
}

export const isProviderError = (value: unknown): value is ProviderError =>
  value instanceof ProviderError;

/** Only ProviderErrors carry enough information to be safely retried. */
export const isRetryableProviderError = (value: unknown): boolean =>
  isProviderError(value) && RETRYABLE_CODES.has(value.code);
