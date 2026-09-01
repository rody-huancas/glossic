import { genericAdapter } from "@glossic/adapter-generic";
import { nestjsAdapter } from "@glossic/adapter-nestjs";
import { treesitterAdapter } from "@glossic/adapter-treesitter";
import type { AdapterRegistry, ProviderRegistry } from "@glossic/core";
import { createAdapterRegistry, createProviderRegistry } from "@glossic/core";
import { createAnthropicProvider } from "@glossic/provider-anthropic";
import { createClaudeCodeProvider } from "@glossic/provider-claude-code";
import type { GlossicConfig, Provider } from "@glossic/schema";

/**
 * Every adapter shipped with the CLI, in priority order. The generic adapter
 * detects everything, so it must stay last.
 */
export const builtinAdapters = [nestjsAdapter, treesitterAdapter, genericAdapter];

/** A secret is not an option, so it travels beside the config and never inside it. */
export interface ProviderSecrets {
  anthropicApiKey?: string | undefined;
}

/**
 * Every provider shipped with the CLI, built against the resolved config so
 * that `model` and `timeoutMs` are not options the config only pretends to
 * have. A saved API key is handed over the same way, so the Anthropic provider
 * works without the environment variable being set.
 */
export const createProviders = (
  config ?: Pick<GlossicConfig, "model" | "timeoutMs">,
  secrets?: ProviderSecrets,
): Provider[] => [
  createClaudeCodeProvider({
    ...(config?.model === undefined ? {} : { model: config.model }),
    ...(config?.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
  }),
  createAnthropicProvider({
    ...(config?.model === undefined ? {} : { model: config.model }),
    ...(secrets?.anthropicApiKey === undefined ? {} : { apiKey: secrets.anthropicApiKey }),
  }),
];

/** The default-config instances, for callers with nothing resolved yet. */
export const builtinProviders: Provider[] = createProviders();

/** Name-keyed lookups over the builtin lists, for resolving an id the config named. */
export const adapters: AdapterRegistry   = createAdapterRegistry(builtinAdapters);
export const providers: ProviderRegistry = createProviderRegistry(builtinProviders);
