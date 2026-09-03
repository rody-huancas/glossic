import type { Manifest, Provider } from "@glossic/schema";

import type { RetryOptions } from "../retry.js";
import type { PipelineContext } from "../scan.js";

/**
 * `projects` narrows a run to the units of those projects, and `reviewPlan`
 * lets a caller narrow it after seeing what the plan costs -- both exist so a
 * workspace too big for one run can be done a project at a time.
 */
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

/** What one project would cost this run, for a caller deciding what to send. */
export interface PlanProject {
  id             : string;
  name           : string;
  pending        : number;
  cached         : number;
  estimatedTokens: number;
}

/** The whole plan, in the shape a caller needs to warn about it or split it. */
export interface PlanReview {
  pending        : number;
  cached         : number;
  estimatedTokens: number;
  projects       : PlanProject[];
}

/**
 * Called once with the plan and before any completion is sent, and answers
 * with the projects to generate: undefined for all of them, an empty list for
 * none. It is never called for a dry run, which sends nothing anyway.
 */
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

/**
 * A page that was written, but not exactly as the provider wrote it. It carries
 * the numbers rather than a sentence, because the sentence has to be spelled
 * and pluralised in whatever language the CLI is speaking.
 */
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

/**
 * Why a run gave up on the rest of its plan, and how many units it never
 * reached. `unitId` is the one that hit the wall, and it is in `failures` too.
 */
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
