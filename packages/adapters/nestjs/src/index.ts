import type { Adapter, DiscoveredUnit, ExtractResult } from "@glossic/schema";

export const nestjsAdapterName = "nestjs";

export const nestjsAdapter: Adapter = {
  name    : nestjsAdapterName,
  detect  : async (): Promise<boolean> => false,
  discover: async (): Promise<DiscoveredUnit[]> => [],
  extract : async (): Promise<ExtractResult> => ({ units: [], relations: [] }),
};

export default nestjsAdapter;
