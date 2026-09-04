import path from "node:path";
import process from "node:process";

import type { GenerateResult, PlanReview } from "@glossic/core";
import { generate, resolveProvider, writeManifest } from "@glossic/core";
import { Command } from "commander";

import type { QuotaChoice } from "./quota.js";
import { clackPrompts } from "../../ui/prompts.js";
import { askAfterQuota } from "./quota.js";
import { shouldDecorate } from "../../ui/banner.js";
import { readPreferences } from "../../preferences.js";
import { createTranslator } from "../../i18n/index.js";
import { createGenerateProgress } from "../../ui/progress.js";
import { askPlanScope, pickProject } from "./plan.js";
import { builtinAdapters, createProviders } from "../../registries.js";
import { flagsToConfig, resolveEffectiveConfig } from "../../config.js";
import { renderGenerateReport, renderPlanIntro, renderUnmatchedRemovals } from "../../render/index.js";
import type { PromptPort } from "../../ui/prompts.js";

export type { QuotaChoice } from "./quota.js";

export interface GenerateCliOptions {
  dryRun     ?: boolean;
  provider   ?: string;
  out        ?: string;
  lang       ?: string;
  uiLang     ?: string;
  model      ?: string;
  concurrency?: string;
  force      ?: boolean;
  only       ?: string;
  quiet      ?: boolean;
}

const parseConcurrency = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--concurrency must be a positive integer, got "${value}"`);
  }

  return parsed;
};


export interface GenerateDeps {
  createProviders?: typeof createProviders;
  cwd            ?: string;
  prompts        ?: PromptPort;
  menu           ?: boolean;
  onQuotaChoice  ?: (choice: QuotaChoice) => void;
}

export const runGenerate = async (target: string, options: GenerateCliOptions, deps: GenerateDeps = {}): Promise<GenerateResult> => {
  const cwd  = deps.cwd ?? process.cwd();
  const root = path.resolve(cwd, target);

  const { config, origins, lists } = await resolveEffectiveConfig({
    root,
    flags: flagsToConfig({
      lang       : options.lang,
      uiLang     : options.uiLang,
      provider   : options.provider,
      model      : options.model,
      concurrency: parseConcurrency(options.concurrency),
    }),
  });

  const outDir = options.out === undefined
    ? path.resolve(root, config.output.dir)
    : path.resolve(cwd, options.out);

  const t      = createTranslator(config.uiLang);
  const dryRun = options.dryRun === true;
  const saved  = await readPreferences();

  process.stderr.write(renderUnmatchedRemovals(lists, t));

  const provider = dryRun
    ? undefined
    : await resolveProvider({
        providers: (deps.createProviders ?? createProviders)(config, {
          ...(saved.anthropicApiKey === undefined ? {} : { anthropicApiKey: saved.anthropicApiKey }),
        }),
        config,
      });

  const decorate = shouldDecorate({ quiet: options.quiet });

  const prompts = deps.prompts ?? (decorate ? clackPrompts : undefined);

  const canAsk = !dryRun && options.quiet !== true && prompts !== undefined;

  let byProject = false;
  let cancelled = false;
  let pass      = 0;

  let elsewhere = 0;

  const reviewPlan = async (review: PlanReview): Promise<readonly string[] | undefined> => {
    process.stdout.write(renderPlanIntro(review, config.warnAboveUnits, t));

    if (!canAsk) {
      return undefined;
    }

    if (pass === 1 && review.pending > config.warnAboveUnits) {
      const scope = await askPlanScope(prompts, t);

      if (scope === "cancel") {
        cancelled = true;
        return [];
      }

      byProject = scope === "by-project";
    }

    if (!byProject) {
      return undefined;
    }

    const chosen = await pickProject(prompts, t, review);

    if (chosen === undefined) {
      cancelled = true;
      return [];
    }

    elsewhere = review.projects.filter(
      (project) => project.pending > 0 && project.id !== chosen,
    ).length;

    return [chosen];
  };

  let result: GenerateResult;

  for (;;) {
    pass += 1;

    const progress = dryRun || !decorate ? undefined : createGenerateProgress(t);

    result = await generate({
      root,
      adapters: builtinAdapters,
      config,
      outDir,
      dryRun,
      force: options.force === true,
      ...(options.only === undefined ? {} : { only: options.only }),
      ...(provider === undefined ? {} : { provider }),
      ...(progress === undefined ? {} : { onEvent: progress.onEvent }),
      ...(dryRun ? {} : { reviewPlan }),
    });

    progress?.finish("");

    if (!dryRun) {
      await writeManifest(result.manifest, path.resolve(root, config.output.manifest));
    }

    process.stdout.write(
      renderGenerateReport(result, {
        outDir,
        cwd,
        provider: provider?.name,
        language: { code: config.lang, origin: origins.lang ?? "default" },
        t,
      }),
    );

    if (cancelled) break;

    if (result.aborted !== undefined) {
      if (!canAsk) break;

      const next = await askAfterQuota(prompts, t, result, deps.menu === true);

      deps.onQuotaChoice?.(next);

      if (next === "retry") continue;

      break;
    }

    if (!byProject || elsewhere === 0) break;
  }

  if (result.failures.length > 0) process.exitCode = 1;

  return result;
};


export const generateCommand = (): Command =>
  new Command("generate")
    .description("generate documentation (scan + LLM completion)")
    .argument("[path]", "workspace root", ".")
    .option("--dry-run", "list the units and estimate tokens, call no provider", false)
    .option("--provider <name>", "force a provider (claude-code, anthropic)")
    .option("--model <name>", "model the provider should use")
    .option("--out <dir>", "docs destination; relative to the cwd, default <root>/docs")
    .option("--lang <code>", "language of the documentation (default: system language)")
    .option("--ui-lang <code>", "language of the CLI itself: en or es (default: system language)")
    .option("--concurrency <n>", "parallel completions (default: 3)")
    .option("--force", "ignore the cache and regenerate everything", false)
    .option("--only <glob>", "regenerate only the units matching this glob")
    .option("-q, --quiet", "no banner, no spinner and no questions", false)
    .action(async (target: string, options: GenerateCliOptions) => {
      await runGenerate(target, options);
    });
