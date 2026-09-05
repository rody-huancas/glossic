import type { GlossicConfig, Layer, Manifest, Workspace } from "@glossic/schema";

/** What every pipeline stage needs: where to scan, with which adapters and config. */
export interface PipelineContext {
  root        : string;
  adapters    : readonly Layer[];
  config     ?: GlossicConfig;
  generatedAt?: string;
}


/** `enrichersByProject` lists them in the order they ran, empty when none claimed the project. */
export interface ScanResult {
  manifest          : Manifest;
  workspace         : Workspace;
  adapterByProject  : Record<string, string>;
  enrichersByProject: Record<string, string[]>;
}
