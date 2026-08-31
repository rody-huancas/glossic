import type { Adapter, GlosikConfig, Manifest, Provider } from "@glosik/schema";
import { NotImplementedError } from "./errors.js";

export interface PipelineContext {
  root: string;
  config: GlosikConfig;
  adapters: Adapter[];
  provider?: Provider;
}

export interface ScanResult {
  manifest: Manifest;
}

export interface GenerateResult {
  manifest: Manifest;
  written: string[];
}

export interface CheckResult {
  stale: string[];
  missing: string[];
  upToDate: boolean;
}

/** Static analysis only: adapters run, no LLM is involved. */
export const scan = async (_ctx: PipelineContext): Promise<ScanResult> => {
  throw new NotImplementedError("scan");
};

/** Scan, then ask the provider for prose and write the docs out. */
export const generate = async (_ctx: PipelineContext): Promise<GenerateResult> => {
  throw new NotImplementedError("generate");
};

/** Compare unit hashes against the last manifest. */
export const check = async (_ctx: PipelineContext): Promise<CheckResult> => {
  throw new NotImplementedError("check");
};
