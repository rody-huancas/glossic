import { isAdapter, isEnricher } from "@glossic/schema";
import type { Adapter, DiscoverContext, Enricher, Layer } from "@glossic/schema";

/** Puts the adapters in the order the config asks for, dropping the ones it omits. */
export const orderAdapters = (adapters: readonly Layer[], wanted: readonly string[]): Layer[] => {
  const byName = new Map(adapters.map((adapter) => [adapter.name, adapter]));

  return wanted
    .map((name) => byName.get(name))
    .filter((adapter): adapter is Layer => adapter !== undefined);
};


/** The first adapter that claims the project; enrichers in the chain are skipped here. */
export const selectAdapter = async (layers: readonly Layer[], ctx: DiscoverContext): Promise<Adapter | undefined> => {
  for (const layer of layers) {
    if (isAdapter(layer) && await layer.detect(ctx)) {
      return layer;
    }
  }

  return undefined;
};


/** Every enricher that claims the project, in the order the chain lists them. */
export const selectEnrichers = async (layers: readonly Layer[], ctx: DiscoverContext): Promise<Enricher[]> => {
  const claimed: Enricher[] = [];

  for (const layer of layers) {
    if (isEnricher(layer) && await layer.detect(ctx)) {
      claimed.push(layer);
    }
  }

  return claimed;
};
