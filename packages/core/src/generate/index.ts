import path from "node:path";

import picomatch from "picomatch";
import { GlossicConfigSchema } from "@glossic/schema";
import type { Unit } from "@glossic/schema";

import { scan } from "../scan.js";
import { withRetry } from "../retry.js";
import { PROMPT_VERSION } from "../prompt.js";
import { buildJobs, writeDoc } from "./jobs.js";
import { decide, modelCacheKey } from "./decide.js";
import { compareStrings, toPosix } from "../utils/index.js";
import { excerpt, prepareDocument } from "../validate.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { INDEX_DOC_PATH, renderIndexDoc, renderUnitDoc } from "../markdown.js";
import { type CacheEntry, type CacheFile, DEFAULT_CACHE_PATH, emptyCache, indexCache, readCache, writeCache } from "../cache.js";
import type { Job } from "./jobs.js";
import type { DecisionContext } from "./decide.js";
import type { GenerateContext, GenerateEvent, GenerateFailure, GeneratePlanEntry, GenerateResult, GenerateWarning, UnitOutcome } from "./types.js";

export * from "./types.js";
export { modelCacheKey } from "./decide.js";


/** One string field off an unknown error cause, for the failure report. */
const stringField = (cause: unknown, field: string): string | undefined => {
  if (typeof cause !== "object" || cause === null || !(field in cause)) {
    return undefined;
  }

  const value = (cause as Record<string, unknown>)[field];

  return typeof value === "string" ? value : undefined;
};


/**
 * Scans, works out what the cache still covers, and writes a page for the
 * rest. With no provider, or with dryRun, it stops at the plan and spends nothing.
 */
export const generate = async (ctx: GenerateContext): Promise<GenerateResult> => {
  const config  = ctx.config ?? GlossicConfigSchema.parse({});
  const scanned = await scan(ctx);
  const { manifest } = scanned;
  const generatedAt = manifest.generatedAt;
  const root        = manifest.workspace.root;

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

  const plan: GeneratePlanEntry[] = decisions
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

  const estimatedTokens = sumTokens(true);
  const savedTokens     = sumTokens(false);
  const fromCache       = plan.filter((entry) => !entry.regenerate).length;

  if (ctx.dryRun === true || ctx.provider === undefined) {
    return {
      manifest,
      written: [],
      plan,
      failures: [],
      warnings: [],
      filteredOut,
      estimatedTokens,
      savedTokens,
      generated: 0,
      fromCache,
      dryRun: true,
    };
  }

  const provider                    = ctx.provider;
  const failures: GenerateFailure[] = [];
  const warnings: GenerateWarning[] = [];
  const summaries                   = new Map<string, string>();
  const pending                     = decisions.filter(({ reason }) => reason !== "cached");

  const total   = decisions.length;
  let completed = 0;

  const report = (event: GenerateEvent): void => ctx.onEvent?.(event);

  const finished = (unitId: string, outcome: UnitOutcome, durationMs: number): void => {
    completed += 1;
    report({ type: "unit-done", unitId, index: completed, total, outcome, durationMs });
  };

  for (const { job } of decisions.filter(({ reason }) => reason === "cached")) {
    report({ type: "unit-start", unitId: job.unit.id, index: completed + 1, total });
    finished(job.unit.id, "cached", 0);
  }

  const outcomes = await mapWithConcurrency(pending, config.concurrency, async ({ job }) => {
    const startedAt = Date.now();
    report({ type: "unit-start", unitId: job.unit.id, index: completed + 1, total });

    try {
      const completion = await withRetry(() => provider.complete(job.request), ctx.retry);

      const prepared = prepareDocument(provider.name, completion.text);

      if (prepared.droppedPreamble !== undefined) {
        warnings.push({
          unitId : job.unit.id,
          message: `dropped ${prepared.droppedPreamble.length} characters before the first heading: ${excerpt(prepared.droppedPreamble, 120)}`,
        });
      }

      finished(job.unit.id, "generated", Date.now() - startedAt);
      return { job, body: prepared.body };
    } catch (cause) {
      failures.push({
        unitId: job.unit.id,
        reason: cause instanceof Error ? cause.message: String(cause),
        code  : stringField(cause, "code"),
        detail: stringField(cause, "detail"),
      });

      finished(job.unit.id, "failed", Date.now() - startedAt);
      return undefined;
    }
  });

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
    filteredOut,
    estimatedTokens,
    savedTokens,
    generated: fresh.length,
    fromCache,
    dryRun: false,
  };
};
