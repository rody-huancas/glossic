import { isRetryableProviderError } from "@glossic/schema";

export interface RetryOptions {
  attempts   ?: number;
  baseDelayMs?: number;
  sleep      ?: (ms: number) => Promise<void>;
  onRetry    ?: (attempt: number, error: unknown) => void;
}

const DEFAULT_ATTEMPTS      = 3;
const DEFAULT_BASE_DELAY_MS = 500;

const defaultSleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}


export const backoffDelay = (attempt: number, baseDelayMs: number): number => {
  return baseDelayMs * 2 ** (attempt - 1);
}


export const withRetry = async <T>(task: () => Promise<T>, options: RetryOptions = {}): Promise<T> => {
  const attempts    = options.attempts ?? DEFAULT_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep       = options.sleep ?? defaultSleep;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      if (attempt === attempts || !isRetryableProviderError(error)) {
        throw error;
      }

      options.onRetry?.(attempt, error);

      await sleep(backoffDelay(attempt, baseDelayMs));
    }
  }

  throw lastError;
};
