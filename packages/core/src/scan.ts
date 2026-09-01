import path from "node:path";

import { GlossicConfigSchema } from "@glossic/schema";
import type { Adapter, AdapterContext, DiscoverContext, ExtractResult, GlossicConfig, Manifest, Workspace } from "@glossic/schema";

import { buildManifest } from "./manifest.js";
import { resolveWorkspace } from "./workspace.js";

/** What every pipeline stage needs: where to scan, with which adapters and config. */
export interface PipelineContext {
  root        : string;
  adapters    : readonly Adapter[];
  config     ?: GlossicConfig;
  generatedAt?: string;
}

export interface ScanResult {
  manifest        : Manifest;
  workspace       : Workspace;
  adapterByProject: Record<string, string>;
}


/** Puts the adapters in the order the config asks for, dropping the ones it omits. */
export const orderAdapters = (adapters: readonly Adapter[], wanted: readonly string[]): Adapter[] => {
  const byName = new Map(adapters.map((adapter) => [adapter.name, adapter]));

  return wanted
    .map((name) => byName.get(name))
    .filter((adapter): adapter is Adapter => adapter !== undefined);
};

/** The first adapter that claims the project. */
const selectAdapter = async (adapters: readonly Adapter[], ctx: DiscoverContext): Promise<Adapter | undefined> => {
  for (const adapter of adapters) {
    if (await adapter.detect(ctx)) {
      return adapter;
    }
  }

  return undefined;
};


/** Walks the workspace and turns it into a manifest, calling no provider. */
export const scan = async (ctx: PipelineContext): Promise<ScanResult> => {
  const config                         = ctx.config ?? GlossicConfigSchema.parse({});
  const workspace                      = await resolveWorkspace(path.resolve(ctx.root));
  const adapters                       = orderAdapters(ctx.adapters, config.adapters);
  const adapterContext: AdapterContext = { root: workspace.root, workspace, config };

  const results: ExtractResult[]                 = [];
  const adapterByProject: Record<string, string> = {};

  for (const project of workspace.projects) {
    const discoverContext: DiscoverContext = { ...adapterContext, project };
    const adapter                          = await selectAdapter(adapters, discoverContext);

    if (adapter === undefined) continue;

    adapterByProject[project.id] = adapter.name;

    const units = await adapter.discover(discoverContext);
    
    results.push(await adapter.extract({ ...discoverContext, units }));
  }

  const manifest = buildManifest(
    workspace,
    results,
    ctx.generatedAt === undefined ? {} : { generatedAt: ctx.generatedAt },
  );

  return { manifest, workspace, adapterByProject };
};
