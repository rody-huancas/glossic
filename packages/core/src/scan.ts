import path from "node:path";

import type {
  Adapter,
  AdapterContext,
  DiscoverContext,
  ExtractResult,
  GlossicConfig,
  Manifest,
  Workspace,
} from "@glossic/schema";
import { GlossicConfigSchema } from "@glossic/schema";

import { buildManifest } from "./manifest.js";
import { resolveWorkspace } from "./workspace.js";

export interface PipelineContext {
  /** Workspace root. Relative paths are resolved against the cwd. */
  root: string;
  /** Adapters in priority order; the first one whose `detect` passes wins. */
  adapters: readonly Adapter[];
  config?: GlossicConfig;
  /** ISO-8601 timestamp. Injectable so tests get a stable manifest. */
  generatedAt?: string;
}

export interface ScanResult {
  manifest: Manifest;
  workspace: Workspace;
  /** Which adapter handled each project, keyed by project id. */
  adapterByProject: Record<string, string>;
}

/**
 * `config.adapters` is a list of ids in priority order. Anything not on it is
 * out of play: naming an adapter is how a project opts into it.
 */
export const orderAdapters = (
  adapters: readonly Adapter[],
  wanted: readonly string[],
): Adapter[] => {
  const byName = new Map(adapters.map((adapter) => [adapter.name, adapter]));
  return wanted
    .map((name) => byName.get(name))
    .filter((adapter): adapter is Adapter => adapter !== undefined);
};

const selectAdapter = async (
  adapters: readonly Adapter[],
  ctx: DiscoverContext,
): Promise<Adapter | undefined> => {
  for (const adapter of adapters) {
    if (await adapter.detect(ctx)) return adapter;
  }
  return undefined;
};

/**
 * Static analysis only: resolves the workspace, runs one adapter per project
 * and assembles the manifest. No LLM, no network.
 */
export const scan = async (ctx: PipelineContext): Promise<ScanResult> => {
  const config = ctx.config ?? GlossicConfigSchema.parse({});
  const workspace = await resolveWorkspace(path.resolve(ctx.root));
  const adapterContext: AdapterContext = { root: workspace.root, workspace, config };
  const adapters = orderAdapters(ctx.adapters, config.adapters);

  const results: ExtractResult[] = [];
  const adapterByProject: Record<string, string> = {};

  for (const project of workspace.projects) {
    const discoverContext: DiscoverContext = { ...adapterContext, project };
    const adapter = await selectAdapter(adapters, discoverContext);
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
