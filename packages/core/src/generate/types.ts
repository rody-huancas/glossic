import type { Manifest, Provider } from "@glossic/schema";

import type { RetryOptions } from "../retry.js";
import type { PipelineContext } from "../scan.js";

export interface GenerateContext extends PipelineContext {
  outDir    : string;
  provider ?: Provider;
  dryRun   ?: boolean;
  force    ?: boolean;
  only     ?: string;
  cachePath?: string;
  retry    ?: RetryOptions;
  onEvent  ?: (event: GenerateEvent) => void;
}

export type UnitOutcome = "generated" | "cached" | "failed";

export type GenerateEvent = 
  | { type: "unit-start"; unitId: string; index: number; total: number }
  | {
      type      : "unit-done";
      unitId    : string;
      index     : number;
      total     : number;
      outcome   : UnitOutcome;
      durationMs: number;
    };

export type GenerateReason = 
  | "cached"
  | "new"
  | "content-changed"
  | "prompt-version-changed"
  | "model-changed"
  | "lang-changed"
  | "output-missing"
  | "forced";

export interface GeneratePlanEntry {
  unitId         : string;
  docPath        : string;
  files          : number;
  estimatedTokens: number;
  reason         : GenerateReason;
  regenerate     : boolean;
}

export interface GenerateWarning {
  unitId : string;
  message: string;
}

export interface GenerateFailure {
  unitId: string;
  reason: string;
  code  : string | undefined;
  detail: string | undefined;
}

export interface GenerateResult {
  manifest       : Manifest;
  written        : string[];
  plan           : GeneratePlanEntry[];
  failures       : GenerateFailure[];
  warnings       : GenerateWarning[];
  filteredOut    : string[];
  estimatedTokens: number;
  savedTokens    : number;
  generated      : number;
  fromCache      : number;
  dryRun         : boolean;
}
