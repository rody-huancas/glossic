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

/**
 * Every provider shipped with the CLI, built against the resolved config so
 * that `model` and `timeoutMs` are not options the config only pretends to have.
 */
export const createProviders = (
  config?: Pick<GlossicConfig, "model" | "timeoutMs">,
): Provider[] => [
  createClaudeCodeProvider({
    ...(config?.model === undefined ? {} : { model: config.model }),
    ...(config?.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
  }),
  createAnthropicProvider(config?.model === undefined ? {} : { model: config.model }),
];

/** The default-config instances, for callers with nothing resolved yet. */
export const builtinProviders: Provider[] = createProviders();

export const adapters: AdapterRegistry   = createAdapterRegistry(builtinAdapters);
export const providers: ProviderRegistry = createProviderRegistry(builtinProviders);
