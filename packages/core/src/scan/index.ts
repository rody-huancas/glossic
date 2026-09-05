import path from "node:path";

import { GlossicConfigSchema } from "@glossic/schema";
import type { AdapterContext, DiscoverContext, ExtractResult } from "@glossic/schema";

import { buildManifest } from "../manifest.js";
import { applyEnrichment } from "./enrich.js";
import { resolveWorkspace } from "../workspace.js";
import { orderAdapters, selectAdapter, selectEnrichers } from "./layers.js";
import type { PipelineContext, ScanResult } from "./types.js";

export * from "./types.js";
export { applyEnrichment } from "./enrich.js";
export { orderAdapters, selectAdapter, selectEnrichers } from "./layers.js";


/** Walks the workspace and turns it into a manifest, calling no provider. */
export const scan = async (ctx: PipelineContext): Promise<ScanResult> => {
  const config                         = ctx.config ?? GlossicConfigSchema.parse({});
  const workspace                      = await resolveWorkspace(path.resolve(ctx.root));
  const layers                         = orderAdapters(ctx.adapters, config.adapters);
  const adapterContext: AdapterContext = { root: workspace.root, workspace, config };

  const results: ExtractResult[] = [];
  const adapterByProject: Record<string, string> = {};
  const enrichersByProject: Record<string, string[]> = {};

  for (const project of workspace.projects) {
    const discoverContext: DiscoverContext = { ...adapterContext, project };
    const adapter                          = await selectAdapter(layers, discoverContext);

    if (adapter === undefined) continue;

    adapterByProject[project.id] = adapter.name;

    const discovered = await adapter.discover(discoverContext);
    const enrichers  = await selectEnrichers(layers, discoverContext);

    let extracted = await adapter.extract({ ...discoverContext, units: discovered });

    for (const enricher of enrichers) {
      const enrichment = await enricher.enrich({ ...discoverContext, units: extracted.units });

      extracted = applyEnrichment(extracted, enricher.name, enrichment);
    }

    enrichersByProject[project.id] = enrichers.map((enricher) => enricher.name);

    results.push(extracted);
  }

  const manifest = buildManifest(
    workspace,
    results,
    ctx.generatedAt === undefined ? {} : { generatedAt: ctx.generatedAt },
  );

  return { manifest, workspace, adapterByProject, enrichersByProject };
};
