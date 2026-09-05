import { isAdapter, isEnricher } from "@glossic/schema";
import type { Adapter, DiscoverContext, Enricher, Layer } from "@glossic/schema";

export const orderAdapters = (adapters: readonly Layer[], wanted: readonly string[]): Layer[] => {
  const byName = new Map(adapters.map((adapter) => [adapter.name, adapter]));

  return wanted
    .map((name) => byName.get(name))
    .filter((adapter): adapter is Layer => adapter !== undefined);
};


export const selectAdapter = async (layers: readonly Layer[], ctx: DiscoverContext): Promise<Adapter | undefined> => {
  for (const layer of layers) {
    if (isAdapter(layer) && await layer.detect(ctx)) {
      return layer;
    }
  }

  return undefined;
};


export const selectEnrichers = async (layers: readonly Layer[], ctx: DiscoverContext): Promise<Enricher[]> => {
  const claimed: Enricher[] = [];

  for (const layer of layers) {
    if (isEnricher(layer) && await layer.detect(ctx)) {
      claimed.push(layer);
    }
  }

  return claimed;
};
