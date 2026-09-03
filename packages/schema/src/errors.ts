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

/**
 * Codes that will fail exactly the same way for every remaining unit, so the
 * caller stops the run instead of spending a request per unit finding out.
 *
 * All three are facts about the machine or the account rather than about the
 * unit that happened to ask: no binary, no session, no quota. A rate limit is
 * none of them, and a malformed answer belongs to the one unit that produced it.
 */
const FATAL_CODES: ReadonlySet<ProviderErrorCode> = new Set([
  "quota",
  "unauthenticated",
  "not-installed",
]);

/**
 * How a provider says the account has nothing left to spend. Every provider
 * writes it differently and none of them give it a status of its own, so the
 * phrase is what the "quota" code is read off, and it lives here because both
 * providers map onto the same vocabulary.
 */
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

/** True when a provider's own wording says the quota is spent, not merely busy. */
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

/**
 * True when nothing else in the run can succeed either: the machine or the
 * account is what failed, not the unit that happened to ask.
 */
export const isFatalProviderError = (value: unknown): boolean => {
  return isProviderError(value) && FATAL_CODES.has(value.code);
}
