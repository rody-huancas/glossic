import type {
  Adapter,
  AdapterContext,
  ExtractContext,
  ExtractResult,
  Project,
} from "@glosik/schema";

export const nestjsAdapterName = "nestjs" as const;

/**
 * Understands NestJS modules, controllers, providers and route decorators.
 *
 * Scaffold only: every method is a no-op stub.
 */
export const nestjsAdapter: Adapter = {
  name: nestjsAdapterName,

  detect: async (_ctx: AdapterContext): Promise<boolean> => false,

  discover: async (_ctx: AdapterContext): Promise<Project[]> => [],

  extract: async (_ctx: ExtractContext): Promise<ExtractResult> => ({
    units: [],
    relations: [],
  }),
};

export default nestjsAdapter;
