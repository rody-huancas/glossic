import type { GlossicConfig, Provider } from "@glossic/schema";

import { NoProviderAvailableError, UnknownProviderError } from "./errors.js";
import { compareStrings } from "./utils/index.js";


export const PROVIDER_PREFERENCE = ["claude-code", "anthropic"];

export interface ResolveProviderOptions {
  providers : readonly Provider[];
  config   ?: Pick<GlossicConfig, "provider"> | undefined;
  requested?: string | undefined;
}

export interface ProviderStatus {
  name     : string;
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

export const probeProviders = async (providers: readonly Provider[]): Promise<ProviderStatus[]> =>
  Promise.all(
    byPreference(providers).map(async (provider) => ({
      name     : provider.name,
      available: await provider.available().catch(() => false),
    })),
  );


export const resolveProvider = async (options: ResolveProviderOptions): Promise<Provider> => {
  const known    = options.providers.map((provider) => provider.name);
  const explicit = options.requested ?? options.config?.provider;

  if (explicit !== undefined && explicit !== "") {
    const match = options.providers.find((provider) => provider.name === explicit);

    if (match === undefined) {
      throw new UnknownProviderError(explicit, known);
    }

    return match;
  }

  for (const provider of byPreference(options.providers)) {
    if (await provider.available().catch(() => false)) {
      return provider;
    }
  }

  throw new NoProviderAvailableError(known);
};
