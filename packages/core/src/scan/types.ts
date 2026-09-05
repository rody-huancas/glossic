import type { GlossicConfig, Layer, Manifest, Workspace } from "@glossic/schema";

export interface PipelineContext {
  root        : string;
  adapters    : readonly Layer[];
  config     ?: GlossicConfig;
  generatedAt?: string;
}


export interface ScanResult {
  manifest          : Manifest;
  workspace         : Workspace;
  adapterByProject  : Record<string, string>;
  enrichersByProject: Record<string, string[]>;
}
