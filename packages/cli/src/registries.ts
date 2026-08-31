import { genericAdapter } from "@glosik/adapter-generic";
import { nestjsAdapter } from "@glosik/adapter-nestjs";
import { treesitterAdapter } from "@glosik/adapter-treesitter";
import type { AdapterRegistry, ProviderRegistry } from "@glosik/core";
import { createAdapterRegistry, createProviderRegistry } from "@glosik/core";
import { anthropicProvider } from "@glosik/provider-anthropic";
import { claudeCodeProvider } from "@glosik/provider-claude-code";

/** Every adapter shipped with the CLI. */
export const builtinAdapters = [genericAdapter, treesitterAdapter, nestjsAdapter];

/** Every provider shipped with the CLI. */
export const builtinProviders = [claudeCodeProvider, anthropicProvider];

export const adapters: AdapterRegistry = createAdapterRegistry(builtinAdapters);
export const providers: ProviderRegistry = createProviderRegistry(builtinProviders);
