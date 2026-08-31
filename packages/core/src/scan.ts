import path from "node:path";

import type {
  Adapter,
  AdapterContext,
  DiscoverContext,
  ExtractResult,
  GlosikConfig,
  Manifest,
  Workspace,
} from "@glosik/schema";
import { GlosikConfigSchema } from "@glosik/schema";

import { buildManifest } from "./manifest.js";
import { resolveWorkspace } from "./workspace.js";

export interface PipelineContext {
  /** Workspace root. Relative paths are resolved against the cwd. */
  root: string;
  /** Adapters in priority order; the first one whose `detect` passes wins. */
  adapters: readonly Adapter[];
  config?: GlosikConfig;
  /** ISO-8601 timestamp. Injectable so tests get a stable manifest. */
  generatedAt?: string;
}

export interface ScanResult {
  manifest: Manifest;
  workspace: Workspace;
  /** Which adapter handled each project, keyed by project id. */
  adapterByProject: Record<string, string>;
}

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
  const config = ctx.config ?? GlosikConfigSchema.parse({});
  const workspace = await resolveWorkspace(path.resolve(ctx.root));
  const adapterContext: AdapterContext = { root: workspace.root, workspace, config };

  const results: ExtractResult[] = [];
  const adapterByProject: Record<string, string> = {};

  for (const project of workspace.projects) {
    const discoverContext: DiscoverContext = { ...adapterContext, project };
    const adapter = await selectAdapter(ctx.adapters, discoverContext);
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
