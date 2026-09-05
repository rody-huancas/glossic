import { genericAdapter } from "@glossic/adapter-generic";
import { nestjsAdapter } from "@glossic/adapter-nestjs";
import { treesitterAdapter } from "@glossic/adapter-treesitter";
import type { AdapterRegistry, ProviderRegistry } from "@glossic/core";
import { createAdapterRegistry, createProviderRegistry } from "@glossic/core";
import { createAnthropicProvider } from "@glossic/provider-anthropic";
import { createClaudeCodeProvider } from "@glossic/provider-claude-code";
import type { GlossicConfig, Layer, Provider } from "@glossic/schema";

export const builtinAdapters: Layer[] = [nestjsAdapter, treesitterAdapter, genericAdapter];

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

export const builtinProviders: Provider[] = createProviders();

export const adapters: AdapterRegistry   = createAdapterRegistry(builtinAdapters);
export const providers: ProviderRegistry = createProviderRegistry(builtinProviders);
