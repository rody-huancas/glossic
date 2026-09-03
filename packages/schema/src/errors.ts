/** Why a completion failed, in the vocabulary every provider maps its own errors onto. */
export type ProviderErrorCode =
  | "not-installed"
  | "unauthenticated"
  | "timeout"
  | "rate-limit"
  | "quota"
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

const FATAL_CODES: ReadonlySet<ProviderErrorCode> = new Set(["quota"]);

const QUOTA_PHRASES: readonly RegExp[] = [
  /usage limit/,
  /quota/,
  /credit balance/,
  /out of credits/,
  /insufficient (?:credit|balance|funds)/,
  /billing/,
  /upgrade (?:your )?plan/,
  /limit will reset/,
];

export const looksLikeQuota = (text: string): boolean => {
  const lower = text.toLowerCase();

  return QUOTA_PHRASES.some((phrase) => phrase.test(lower));
};

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

export const isFatalProviderError = (value: unknown): boolean => {
  return isProviderError(value) && FATAL_CODES.has(value.code);
}
