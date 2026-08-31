import { genericAdapter } from "@glossic/adapter-generic";
import { nestjsAdapter } from "@glossic/adapter-nestjs";
import { treesitterAdapter } from "@glossic/adapter-treesitter";
import type { AdapterRegistry, ProviderRegistry } from "@glossic/core";
import { createAdapterRegistry, createProviderRegistry } from "@glossic/core";
import { anthropicProvider } from "@glossic/provider-anthropic";
import { claudeCodeProvider } from "@glossic/provider-claude-code";

/**
 * Every adapter shipped with the CLI, in priority order. The generic adapter
 * detects everything, so it must stay last.
 */
export const builtinAdapters = [nestjsAdapter, treesitterAdapter, genericAdapter];

/** Every provider shipped with the CLI. */
export const builtinProviders = [claudeCodeProvider, anthropicProvider];

export const adapters: AdapterRegistry = createAdapterRegistry(builtinAdapters);
export const providers: ProviderRegistry = createProviderRegistry(builtinProviders);
