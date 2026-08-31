import type { Adapter, DiscoveredUnit, ExtractResult } from "@glossic/schema";

export const nestjsAdapterName = "nestjs";

/**
 * Understands NestJS modules, controllers, providers and route decorators.
 *
 * Not implemented yet: `detect` returns false so the generic adapter keeps
 * handling these projects.
 */
export const nestjsAdapter: Adapter = {
  name: nestjsAdapterName,

  detect: async (): Promise<boolean> => false,

  discover: async (): Promise<DiscoveredUnit[]> => [],

  extract: async (): Promise<ExtractResult> => ({ units: [], relations: [] }),
};

export default nestjsAdapter;
