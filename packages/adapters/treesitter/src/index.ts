import type { Adapter, DiscoveredUnit, ExtractResult } from "@glossic/schema";

export const treesitterAdapterName = "treesitter";

/**
 * Parses source with tree-sitter grammars to extract syntactic units.
 *
 * Not implemented yet: `detect` returns false so the generic adapter keeps
 * handling these projects.
 */
export const treesitterAdapter: Adapter = {
  name: treesitterAdapterName,

  detect: async (): Promise<boolean> => false,

  discover: async (): Promise<DiscoveredUnit[]> => [],

  extract: async (): Promise<ExtractResult> => ({ units: [], relations: [] }),
};

export default treesitterAdapter;
