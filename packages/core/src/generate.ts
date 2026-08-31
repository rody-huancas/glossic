import fs from "node:fs/promises";
import path from "node:path";

import type {
  CompletionRequest,
  GlosikConfig,
  Manifest,
  Project,
  Provider,
  Unit,
} from "@glosik/schema";
import { GlosikConfigSchema } from "@glosik/schema";

import { INDEX_DOC_PATH, renderIndexDoc, renderUnitDoc, unitDocPath } from "./markdown.js";
import { compareStrings } from "./order.js";
import { toPosix } from "./paths.js";
import { buildUnitPrompt, estimateTokens, readUnitSources } from "./prompt.js";
import type { PipelineContext } from "./scan.js";
import { scan } from "./scan.js";

export interface GenerateContext extends PipelineContext {
  /** Absolute path of the docs directory. */
  outDir: string;
  /** Omitted on a dry run: `--dry-run` must never touch a provider. */
  provider?: Provider;
  dryRun?: boolean;
}

export interface GeneratePlanEntry {
  unitId: string;
  docPath: string;
  files: number;
  estimatedTokens: number;
}

export interface GenerateFailure {
  unitId: string;
  reason: string;
  code: string | undefined;
}

export interface GenerateResult {
  manifest: Manifest;
  /** Posix paths relative to `outDir`, sorted. Empty on a dry run. */
  written: string[];
  /** One entry per unit that would be documented, sorted by unit id. */
  plan: GeneratePlanEntry[];
  failures: GenerateFailure[];
  estimatedTokens: number;
  dryRun: boolean;
}

interface Job {
  unit: Unit;
  project: Project;
  request: CompletionRequest;
  docPath: string;
  estimatedTokens: number;
}

/** Runs `task` over `items` with at most `limit` in flight, preserving order. */
const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> => {
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

const buildJobs = async (
  manifest: Manifest,
  config: GlosikConfig,
  root: string,
): Promise<Job[]> => {
  const projectById = new Map(manifest.workspace.projects.map((entry) => [entry.id, entry]));

  const jobs = await Promise.all(
    manifest.units.map(async (unit): Promise<Job | undefined> => {
      const project = projectById.get(unit.projectId);
      if (project === undefined) return undefined;

      const request = buildUnitPrompt({
        unit,
        project,
        workspaceName: manifest.workspace.name,
        sources: await readUnitSources(root, unit),
        lang: config.lang,
      });

      return {
        unit,
        project,
        request,
        docPath: unitDocPath(unit),
        estimatedTokens: estimateTokens(request),
      };
    }),
  );

  return jobs.filter((job): job is Job => job !== undefined);
};

const errorCode = (cause: unknown): string | undefined =>
  typeof cause === "object" && cause !== null && "code" in cause
    ? String((cause as { code: unknown }).code)
    : undefined;

/**
 * Scan, then ask the provider to describe every unit and write one markdown
 * file per unit, mirroring the source tree, plus a linked index.
 */
export const generate = async (ctx: GenerateContext): Promise<GenerateResult> => {
  const config = ctx.config ?? GlosikConfigSchema.parse({});
  const scanned = await scan(ctx);
  const { manifest } = scanned;
  const generatedAt = manifest.generatedAt;
  const root = manifest.workspace.root;

  const jobs = await buildJobs(manifest, config, root);

  const plan: GeneratePlanEntry[] = jobs
    .map((job) => ({
      unitId: job.unit.id,
      docPath: job.docPath,
      files: job.unit.facts.base.files.length,
      estimatedTokens: job.estimatedTokens,
    }))
    .sort((a, b) => compareStrings(a.unitId, b.unitId));

  const estimatedTokens = plan.reduce((sum, entry) => sum + entry.estimatedTokens, 0);

  if (ctx.dryRun === true || ctx.provider === undefined) {
    return { manifest, written: [], plan, failures: [], estimatedTokens, dryRun: true };
  }

  const provider = ctx.provider;
  const failures: GenerateFailure[] = [];
  const summaries = new Map<string, string>();

  const outcomes = await mapWithConcurrency(jobs, config.concurrency, async (job) => {
    try {
      const completion = await provider.complete(job.request);
      return { job, body: completion.text };
    } catch (cause) {
      // One unit failing must not abort the run: record it and keep going.
      failures.push({
        unitId: job.unit.id,
        reason: cause instanceof Error ? cause.message : String(cause),
        code: errorCode(cause),
      });
      return undefined;
    }
  });

  const written: string[] = [];

  for (const outcome of outcomes) {
    if (outcome === undefined) continue;

    await writeDoc(
      ctx.outDir,
      outcome.job.docPath,
      renderUnitDoc({
        unit: outcome.job.unit,
        project: outcome.job.project,
        body: outcome.body,
        generatedAt,
      }),
    );

    written.push(toPosix(outcome.job.docPath));
    summaries.set(outcome.job.unit.id, outcome.body);
  }

  await writeDoc(ctx.outDir, INDEX_DOC_PATH, renderIndexDoc({ manifest, generatedAt }));
  written.push(INDEX_DOC_PATH);

  const documentedUnits: Unit[] = manifest.units.map((unit) => {
    const summary = summaries.get(unit.id);
    return summary === undefined ? unit : { ...unit, summary };
  });

  return {
    manifest: { ...manifest, units: documentedUnits },
    written: written.sort(compareStrings),
    plan,
    failures: failures.sort((a, b) => compareStrings(a.unitId, b.unitId)),
    estimatedTokens,
    dryRun: false,
  };
};
