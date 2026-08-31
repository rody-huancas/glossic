import type {
  Adapter,
  AdapterContext,
  ExtractContext,
  ExtractResult,
  Project,
} from "@glosik/schema";

export const genericAdapterName = "generic" as const;

/**
 * Fallback adapter: walks the file tree and reports files as opaque units.
 *
 * Scaffold only: every method is a no-op stub.
 */
export const genericAdapter: Adapter = {
  name: genericAdapterName,

  detect: async (_ctx: AdapterContext): Promise<boolean> => false,

  discover: async (_ctx: AdapterContext): Promise<Project[]> => [],

  extract: async (_ctx: ExtractContext): Promise<ExtractResult> => ({
    units: [],
    relations: [],
  }),
};

export default genericAdapter;
