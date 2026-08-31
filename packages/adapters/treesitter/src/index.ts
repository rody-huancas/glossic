import type {
  Adapter,
  AdapterContext,
  ExtractContext,
  ExtractResult,
  Project,
} from "@glosik/schema";

export const treesitterAdapterName = "treesitter" as const;

/**
 * Parses source with tree-sitter grammars to extract syntactic units.
 *
 * Scaffold only: every method is a no-op stub.
 */
export const treesitterAdapter: Adapter = {
  name: treesitterAdapterName,

  detect: async (_ctx: AdapterContext): Promise<boolean> => false,

  discover: async (_ctx: AdapterContext): Promise<Project[]> => [],

  extract: async (_ctx: ExtractContext): Promise<ExtractResult> => ({
    units: [],
    relations: [],
  }),
};

export default treesitterAdapter;
