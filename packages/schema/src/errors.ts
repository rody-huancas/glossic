/** Why a completion failed, in the vocabulary every provider maps its own errors onto. */
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


const RETRYABLE_CODES: ReadonlySet<ProviderErrorCode> = new Set([
  "timeout",
  "rate-limit",
  "server",
]);

export interface ProviderErrorOptions {
  provider : string;
  code     : ProviderErrorCode;
  message  : string;
  detail  ?: string | undefined;
  cause   ?: unknown;
}

/**
 * A completion failure carrying a code, so callers can react to the kind of
 * failure without parsing the message.
 */
export class ProviderError extends Error {
  readonly provider: string;
  readonly code    : ProviderErrorCode;
  readonly detail  : string | undefined;

  constructor(options: ProviderErrorOptions) {
    super(options.message, options.cause === undefined ? {} : { cause: options.cause });
    this.name     = "ProviderError";
    this.provider = options.provider;
    this.code     = options.code;
    this.detail   = options.detail;
  }
}

export const isProviderError = (value: unknown): value is ProviderError => {
  return value instanceof ProviderError;
}

/** True for the codes worth another attempt: timeout, rate limit, server error. */
export const isRetryableProviderError = (value: unknown): boolean => {
  return isProviderError(value) && RETRYABLE_CODES.has(value.code);
}
