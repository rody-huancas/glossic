import type { Adapter, DiscoveredUnit, ExtractResult } from "@glossic/schema";

export const treesitterAdapterName = "treesitter";

/** Placeholder for tree-sitter symbol extraction; claims nothing yet, so generic takes over. */
export const treesitterAdapter: Adapter = {
  name    : treesitterAdapterName,
  detect  : async (): Promise<boolean> => false,
  discover: async (): Promise<DiscoveredUnit[]> => [],
  extract : async (): Promise<ExtractResult> => ({ units: [], relations: [] }),
};

export default treesitterAdapter;
