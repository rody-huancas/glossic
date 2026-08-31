import process from "node:process";

import { isProviderError } from "@glosik/schema";

/**
 * Turns an error into what the user should read. Stack traces are noise for
 * everyone but us, so they stay behind GLOSIK_DEBUG.
 */
export const formatCliError = (error: unknown): string => {
  if (isProviderError(error)) {
    const detail = error.detail === undefined ? "" : `\n  ${error.detail}`;
    return `${error.provider}: ${error.message} [${error.code}]${detail}`;
  }

  if (error instanceof Error) {
    return process.env.GLOSIK_DEBUG === undefined ? error.message : (error.stack ?? error.message);
  }

  return String(error);
};
