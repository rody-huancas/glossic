import type { Manifest, Provider } from "@glossic/schema";

import type { RetryOptions } from "../retry.js";
import type { PipelineContext } from "../scan/index.js";

export interface GenerateContext extends PipelineContext {
  outDir     : string;
  provider  ?: Provider;
  dryRun    ?: boolean;
  force     ?: boolean;
  only      ?: string;
  projects  ?: readonly string[];
  cachePath ?: string;
  retry     ?: RetryOptions;
  onEvent   ?: (event: GenerateEvent) => void;
  reviewPlan?: PlanReviewer;
}

export interface PlanProject {
  id             : string;
  name           : string;
  pending        : number;
  cached         : number;
  estimatedTokens: number;
}

export interface PlanReview {
  pending        : number;
  cached         : number;
  estimatedTokens: number;
  projects       : PlanProject[];
}

export type PlanReviewer = (review: PlanReview) => Promise<readonly string[] | undefined>;

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
  dropped: number;
  excerpt: string;
}

export interface GenerateFailure {
  unitId: string;
  reason: string;
  code  : string | undefined;
  detail: string | undefined;
}

export interface GenerateAbort {
  unitId   : string;
  code     : string;
  reason   : string;
  remaining: number;
}

export interface GenerateResult {
  manifest       : Manifest;
  written        : string[];
  plan           : GeneratePlanEntry[];
  failures       : GenerateFailure[];
  warnings       : GenerateWarning[];
  filteredOut    : string[];
  skipped        : string[];
  aborted        : GenerateAbort | undefined;
  estimatedTokens: number;
  savedTokens    : number;
  generated      : number;
  fromCache      : number;
  dryRun         : boolean;
}
