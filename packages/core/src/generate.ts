import fs from "node:fs/promises";
import path from "node:path";

import picomatch from "picomatch";
import { GlossicConfigSchema } from "@glossic/schema";
import type { CompletionRequest, GlossicConfig, Manifest, Project, Provider, Unit } from "@glossic/schema";

import { scan } from "./scan.js";
import { toPosix } from "./paths.js";
import { withRetry } from "./retry.js";
import { pathExists } from "./fs-utils.js";
import { compareStrings } from "./order.js";
import { excerpt, prepareDocument } from "./validate.js";
import { INDEX_DOC_PATH, renderIndexDoc, renderUnitDoc, unitDocPath } from "./markdown.js";
import { buildUnitPrompt, estimateTokens, PROMPT_VERSION, readUnitSources } from "./prompt.js";
import type { RetryOptions } from "./retry.js";
import type { PipelineContext } from "./scan.js";
import { type CacheEntry, type CacheFile, DEFAULT_CACHE_PATH, emptyCache, indexCache, readCache, writeCache } from "./cache.js";

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


export const modelCacheKey = (config: GlossicConfig): string => config.model ?? "default";

interface Job {
  unit           : Unit;
  project        : Project;
  request        : CompletionRequest;
  docPath        : string;
  estimatedTokens: number;
}

interface DecisionContext {
  outDir: string;
  model : string;
  lang  : string;
  force : boolean;
}

const decide = async (job: Job, entry: CacheEntry | undefined, context: DecisionContext): Promise<GenerateReason> => {
  if (context.force) {
    return "forced";
  }

  if (entry === undefined) {
    return "new";
  }

  if (entry.unitHash !== job.unit.hash) {
    return "content-changed";
  }

  if (entry.promptVersion !== PROMPT_VERSION) {
    return "prompt-version-changed";
  }

  if (entry.model !== context.model) {
    return "model-changed";
  }

  if (entry.lang !== context.lang) {
    return "lang-changed";
  }

  if (!(await pathExists(path.resolve(context.outDir, job.docPath)))) {
    return "output-missing";
  }

  return "cached";
};

const mapWithConcurrency = async <T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor;
      
      cursor += 1;

      const item = items[index];

      if (item === undefined) continue;

      results[index] = await task(item);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
};

const writeDoc = async (outDir: string, relative: string, content: string): Promise<void> => {
  const target = path.resolve(outDir, relative);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
};

const buildJobs = async (manifest: Manifest, config: GlossicConfig, root: string): Promise<Job[]> => {
  const projectById = new Map(manifest.workspace.projects.map((entry) => [entry.id, entry]));

  const jobs = await Promise.all(
    manifest.units.map(async (unit): Promise<Job | undefined> => {
      const project = projectById.get(unit.projectId);

      if (project === undefined) {
        return undefined;
      }

      const request = buildUnitPrompt({
        unit,
        project,
        workspaceName: manifest.workspace.name,
        sources      : await readUnitSources(root, unit),
        lang         : config.lang,
        model        : config.model,
        temperature  : config.temperature,
      });

      return {
        unit,
        project,
        request,
        docPath        : unitDocPath(unit),
        estimatedTokens: estimateTokens(request),
      };
    }),
  );

  return jobs.filter((job): job is Job => job !== undefined);
};

const stringField = (cause: unknown, field: string): string | undefined => {
  if (typeof cause !== "object" || cause === null || !(field in cause)) {
    return undefined;
  }

  const value = (cause as Record<string, unknown>)[field];

  return typeof value === "string" ? value : undefined;
};


export const generate = async (ctx: GenerateContext): Promise<GenerateResult> => {
  const config       = ctx.config ?? GlossicConfigSchema.parse({});
  const scanned      = await scan(ctx);
  const { manifest } = scanned;
  const generatedAt  = manifest.generatedAt;
  const root         = manifest.workspace.root;

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

  const provider = ctx.provider;
  const failures: GenerateFailure[] = [];
  const warnings: GenerateWarning[] = [];
  const summaries = new Map<string, string>();
  const pending = decisions.filter(({ reason }) => reason !== "cached");

  const total = decisions.length;
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

  const written: string[] = [];
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
