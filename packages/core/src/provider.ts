import type { GlosikConfig, Provider } from "@glosik/schema";

import { NoProviderAvailableError, UnknownProviderError } from "./errors.js";
import { compareStrings } from "./order.js";

/**
 * Preference order when nothing is configured: the local CLI first (no API key
 * to manage, no per-token billing), then the API.
 */
export const PROVIDER_PREFERENCE = ["claude-code", "anthropic"];

export interface ResolveProviderOptions {
  /** Every provider the caller knows about. */
  providers: readonly Provider[];
  config?: Pick<GlosikConfig, "provider"> | undefined;
  /** `--provider <name>`, which outranks the config. */
  requested?: string | undefined;
}

export interface ProviderStatus {
  name: string;
  available: boolean;
}

const byPreference = (providers: readonly Provider[]): Provider[] =>
  [...providers].sort((a, b) => {
    const rankA = PROVIDER_PREFERENCE.indexOf(a.name);
    const rankB = PROVIDER_PREFERENCE.indexOf(b.name);
    if (rankA !== rankB) {
      if (rankA === -1) return 1;
      if (rankB === -1) return -1;
      return rankA - rankB;
    }
    return compareStrings(a.name, b.name);
  });

/** Probes every provider. Used by `glosik doctor`; never throws. */
export const probeProviders = async (providers: readonly Provider[]): Promise<ProviderStatus[]> =>
  Promise.all(
    byPreference(providers).map(async (provider) => ({
      name: provider.name,
      available: await provider.available().catch(() => false),
    })),
  );

/**
 * Picks the provider to use: an explicit request wins, then the configured one,
 * then the first available in preference order.
 *
 * A provider named explicitly is returned even when `available()` is false —
 * the caller asked for it, so let its own error explain what is missing.
 */
export const resolveProvider = async (options: ResolveProviderOptions): Promise<Provider> => {
  const known = options.providers.map((provider) => provider.name);
  const explicit = options.requested ?? options.config?.provider;

  if (explicit !== undefined && explicit !== "") {
    const match = options.providers.find((provider) => provider.name === explicit);
    if (match === undefined) throw new UnknownProviderError(explicit, known);
    return match;
  }

  for (const provider of byPreference(options.providers)) {
    if (await provider.available().catch(() => false)) return provider;
  }

  throw new NoProviderAvailableError(known);
};
