import path from "node:path";

import picomatch from "picomatch";
import { GlossicConfigSchema, isFatalProviderError } from "@glossic/schema";
import type { Manifest, Unit } from "@glossic/schema";

import { scan } from "../scan/index.js";
import { withRetry } from "../retry.js";
import { PROMPT_VERSION } from "../prompt.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { buildJobs, writeDoc } from "./jobs.js";
import { decide, modelCacheKey } from "./decide.js";
import { compareStrings, toPosix } from "../utils/index.js";
import { excerpt, prepareDocument } from "../validate.js";
import { INDEX_DOC_PATH, renderIndexDoc, renderUnitDoc } from "../markdown.js";
import { type CacheEntry, type CacheFile, DEFAULT_CACHE_PATH, emptyCache, indexCache, readCache, writeCache } from "../cache.js";
import type { Job } from "./jobs.js";
import type { DecisionContext } from "./decide.js";
import type { GenerateAbort, GenerateContext, GenerateEvent, GenerateFailure, GeneratePlanEntry, GenerateReason, GenerateResult, GenerateWarning, PlanReview, UnitOutcome } from "./types.js";

export * from "./types.js";
export { modelCacheKey } from "./decide.js";


const docsDirOf = (root: string, outDir: string): string => {
  const relative = toPosix(path.relative(root, outDir));

  return relative === "" ? "." : relative;
};


interface Decision {
  job   : Job;
  reason: GenerateReason;
}

interface PlanSummary {
  plan           : GeneratePlanEntry[];
  estimatedTokens: number;
  savedTokens    : number;
  fromCache      : number;
}


const reviewOf = (decisions: readonly Decision[], manifest: Manifest): PlanReview => {
  const projects = manifest.workspace.projects
    .map((project) => {
      const own = decisions.filter(({ job }) => job.unit.projectId === project.id);

      return {
        id             : project.id,
        name           : project.name,
        pending        : own.filter(({ reason }) => reason !== "cached").length,
        cached         : own.filter(({ reason }) => reason === "cached").length,
        estimatedTokens: own
          .filter(({ reason }) => reason !== "cached")
          .reduce((sum, { job }) => sum + job.estimatedTokens, 0),
      };
    })
    .filter((project) => project.pending + project.cached > 0);

  return {
    pending        : projects.reduce((sum, project) => sum + project.pending, 0),
    cached         : projects.reduce((sum, project) => sum + project.cached, 0),
    estimatedTokens: projects.reduce((sum, project) => sum + project.estimatedTokens, 0),
    projects,
  };
};


const stringField = (cause: unknown, field: string): string | undefined => {
  if (typeof cause !== "object" || cause === null || !(field in cause)) {
    return undefined;
  }

  const value = (cause as Record<string, unknown>)[field];

  return typeof value === "string" ? value : undefined;
};


export const generate = async (ctx: GenerateContext): Promise<GenerateResult> => {
  const config      = ctx.config ?? GlossicConfigSchema.parse({});
  const scanned     = await scan(ctx);
  const generatedAt = scanned.manifest.generatedAt;
  const root        = scanned.manifest.workspace.root;
  const manifest    = { ...scanned.manifest, docsDir: docsDirOf(root, ctx.outDir) };

  const cachePath       = ctx.cachePath ?? path.resolve(root, DEFAULT_CACHE_PATH);
  const model           = modelCacheKey(config);
  const previous        = await readCache(cachePath);
  const previousEntries = indexCache(previous);

  const allJobs = await buildJobs(manifest, config, root);

  const matches = ctx.only === undefined ? undefined : picomatch(ctx.only);

  const isSelected = (job: Job): boolean =>
    matches === undefined  ||
    matches(job.unit.id)   ||
    matches(job.unit.name) ||
    matches(job.unit.path);

  const selected    = allJobs.filter(isSelected);
  const filteredOut = allJobs
    .filter((job) => !isSelected(job))
    .map((job) => job.unit.id)
    .sort(compareStrings);

  const decisionContext: DecisionContext = {
    outDir: ctx.outDir,
    model,
    lang : config.lang,
    force: ctx.force === true,
  };

  const decisions = await Promise.all(
    selected.map(async (job) => ({
      job,
      reason: await decide(job, previousEntries.get(job.unit.id), decisionContext),
    })),
  );

  const summarise = (entries: readonly Decision[]): PlanSummary => {
    const plan = entries
      .map(({ job, reason }) => ({
        unitId         : job.unit.id,
        docPath        : job.docPath,
        files          : job.unit.facts.base.files.length,
        estimatedTokens: job.estimatedTokens,
        reason,
        regenerate: reason !== "cached",
      }))
      .sort((a, b) => compareStrings(a.unitId, b.unitId));

    const sumTokens = (regenerate: boolean): number => plan
      .filter((entry) => entry.regenerate === regenerate)
      .reduce((sum, entry) => sum + entry.estimatedTokens, 0);

    return {
      plan,
      estimatedTokens: sumTokens(true),
      savedTokens    : sumTokens(false),
      fromCache      : plan.filter((entry) => !entry.regenerate).length,
    };
  };

  if (ctx.dryRun === true || ctx.provider === undefined) {
    const whole = summarise(decisions);

    return {
      manifest,
      written: [],
      plan   : whole.plan,
      failures: [],
      warnings: [],
      filteredOut,
      skipped: [],
      aborted: undefined,
      estimatedTokens: whole.estimatedTokens,
      savedTokens    : whole.savedTokens,
      generated      : 0,
      fromCache      : whole.fromCache,
      dryRun         : true,
    };
  }

  const requested = ctx.reviewPlan === undefined
    ? ctx.projects
    : (await ctx.reviewPlan(reviewOf(decisions, manifest))) ?? ctx.projects;

  const inScope = requested === undefined
    ? decisions
    : decisions.filter(({ job }) => requested.includes(job.unit.projectId));

  const outOfScope = requested === undefined
    ? []
    : decisions
        .filter(({ job }) => !requested.includes(job.unit.projectId))
        .map(({ job }) => job.unit.id);

  const { plan, estimatedTokens, savedTokens, fromCache } = summarise(inScope);

  const scopedFilteredOut = [...filteredOut, ...outOfScope].sort(compareStrings);

  const provider                    = ctx.provider;
  const failures: GenerateFailure[] = [];
  const warnings: GenerateWarning[] = [];
  const summaries                   = new Map<string, string>();
  const pending                     = inScope.filter(({ reason }) => reason !== "cached");

  const skipped: string[] = [];
  let aborted: GenerateAbort | undefined;

  const total   = inScope.length;
  let completed = 0;

  const report = (event: GenerateEvent): void => ctx.onEvent?.(event);

  const finished = (unitId: string, outcome: UnitOutcome, durationMs: number): void => {
    completed += 1;
    report({ type: "unit-done", unitId, index: completed, total, outcome, durationMs });
  };

  for (const { job } of inScope.filter(({ reason }) => reason === "cached")) {
    report({ type: "unit-start", unitId: job.unit.id, index: completed + 1, total });
    finished(job.unit.id, "cached", 0);
  }

  const outcomes = await mapWithConcurrency(pending, config.concurrency, async ({ job }) => {
    if (aborted !== undefined) {
      skipped.push(job.unit.id);
      return undefined;
    }

    const startedAt = Date.now();
    report({ type: "unit-start", unitId: job.unit.id, index: completed + 1, total });

    try {
      const completion = await withRetry(() => provider.complete(job.request), ctx.retry);

      const prepared = prepareDocument(provider.name, completion.text);

      if (prepared.droppedPreamble !== undefined) {
        warnings.push({
          unitId : job.unit.id,
          dropped: prepared.droppedPreamble.length,
          excerpt: excerpt(prepared.droppedPreamble, 120),
        });
      }

      finished(job.unit.id, "generated", Date.now() - startedAt);
      return { job, body: prepared.body };
    } catch (cause) {
      const failure: GenerateFailure = {
        unitId: job.unit.id,
        reason: cause instanceof Error ? cause.message: String(cause),
        code  : stringField(cause, "code"),
        detail: stringField(cause, "detail"),
      };

      failures.push(failure);

      if (aborted === undefined && isFatalProviderError(cause)) {
        aborted = {
          unitId   : failure.unitId,
          code     : failure.code ?? "unknown",
          reason   : failure.reason,
          remaining: 0,
        };
      }

      finished(job.unit.id, "failed", Date.now() - startedAt);
      return undefined;
    }
  });

  if (aborted !== undefined) {
    aborted = { ...aborted, remaining: skipped.length };
  }

  const written: string[]   = [];
  const fresh: CacheEntry[] = [];

  for (const outcome of outcomes) {
    if (outcome === undefined) continue;

    await writeDoc(
      ctx.outDir,
      outcome.job.docPath,
      renderUnitDoc({
        unit   : outcome.job.unit,
        project: outcome.job.project,
        body   : outcome.body,
        generatedAt,
      }),
    );

    written.push(toPosix(outcome.job.docPath));
    summaries.set(outcome.job.unit.id, outcome.body);
    fresh.push({
      unitId       : outcome.job.unit.id,
      unitHash     : outcome.job.unit.hash,
      promptVersion: PROMPT_VERSION,
      model,
      lang      : config.lang,
      outputPath: outcome.job.docPath,
      generatedAt,
    });
  }

  const merged = new Map(previousEntries);

  for (const entry of fresh) {
    merged.set(entry.unitId, entry);
  }

  const liveUnitIds = new Set(manifest.units.map((unit) => unit.id));

  const nextCache: CacheFile = {
    version: emptyCache().version,
    entries: [...merged.values()].filter((entry) => liveUnitIds.has(entry.unitId)),
  };

  await writeCache(nextCache, cachePath);
  await writeDoc(ctx.outDir, INDEX_DOC_PATH, renderIndexDoc({ manifest, generatedAt }));

  written.push(INDEX_DOC_PATH);

  const documentedUnits: Unit[] = manifest.units.map((unit) => {
    const summary = summaries.get(unit.id);
    return summary === undefined ? unit : { ...unit, summary };
  });

  return {
    manifest: { ...manifest, units: documentedUnits },
    written : written.sort(compareStrings),
    plan,
    failures: failures.sort((a, b) => compareStrings(a.unitId, b.unitId)),
    warnings: warnings.sort((a, b) => compareStrings(a.unitId, b.unitId)),
    filteredOut: scopedFilteredOut,
    skipped    : skipped.sort(compareStrings),
    aborted,
    estimatedTokens,
    savedTokens,
    generated: fresh.length,
    fromCache,
    dryRun: false,
  };
};
