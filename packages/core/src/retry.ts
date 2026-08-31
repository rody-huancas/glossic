import { isRetryableProviderError } from "@glossic/schema";

export interface RetryOptions {
  /** Total attempts, including the first one. */
  attempts?: number;
  baseDelayMs?: number;
  /** Injectable so tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });

/** Exponential: 500ms, 1s, 2s, ... */
export const backoffDelay = (attempt: number, baseDelayMs: number): number =>
  baseDelayMs * 2 ** (attempt - 1);

/**
 * Retries `task` while it fails with a transient provider error. Anything else
 * — a refusal, a missing binary, a bad key, malformed output — is thrown
 * straight through: repeating it would produce the same failure.
 */
export const withRetry = async <T>(
  task: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableProviderError(error)) throw error;

      options.onRetry?.(attempt, error);
      await sleep(backoffDelay(attempt, baseDelayMs));
    }
  }

  throw lastError;
};
