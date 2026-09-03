import path from "node:path";
import process from "node:process";

import type { GenerateResult, PlanReview } from "@glossic/core";
import { generate, resolveProvider, writeManifest } from "@glossic/core";
import { Command } from "commander";

import { askAfterQuota } from "./quota.js";
import type { QuotaChoice } from "./quota.js";
import { askPlanScope, pickProject } from "./plan.js";
import { flagsToConfig, resolveEffectiveConfig } from "../../config.js";
import { createTranslator } from "../../i18n/index.js";
import { readPreferences } from "../../preferences.js";
import { builtinAdapters, createProviders } from "../../registries.js";
import { renderGenerateReport, renderPlanIntro } from "../../render/index.js";
import { shouldDecorate } from "../../ui/banner.js";
import { createGenerateProgress } from "../../ui/progress.js";
import { clackPrompts } from "../../ui/prompts.js";
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

/** Reads --concurrency, rejecting anything that is not a positive integer. */
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

/**
 * `createProviders` is injected so a test can drive the whole chain without a
 * real provider, and `prompts` so it can answer the questions a large plan or a
 * spent quota asks. `menu` says the caller has one to offer going back to.
 */
export interface GenerateDeps {
  createProviders?: typeof createProviders;
  cwd            ?: string;
  prompts        ?: PromptPort;
  menu           ?: boolean;
  onQuotaChoice  ?: (choice: QuotaChoice) => void;
}

/**
 * An explicit --out is the user's path, so it follows the cwd; anything coming
 * from the config belongs to the project, so it follows the scanned root.
 *
 * A failed unit does not abort the run, but it does set a non-zero exit code:
 * CI must not pass on documentation that was never written.
 *
 * The run is a loop rather than a call because two answers send it round again:
 * generating a workspace one project at a time, and retrying after a quota ran
 * out. Every pass is a whole `generate`, so every pass reads the cache the
 * previous one wrote and plans only what is still missing.
 */
export const runGenerate = async (target: string, options: GenerateCliOptions, deps: GenerateDeps = {}): Promise<GenerateResult> => {
  const cwd  = deps.cwd ?? process.cwd();
  const root = path.resolve(cwd, target);

  const { config, origins } = await resolveEffectiveConfig({
    root,
    flags: flagsToConfig({
      lang       : options.lang,
      uiLang     : options.uiLang,
      provider   : options.provider,
      model      : options.model,
      concurrency: parseConcurrency(options.concurrency),
    }),
  });

  const outDir =
    options.out === undefined
      ? path.resolve(root, config.output.dir)
      : path.resolve(cwd, options.out);

  const t      = createTranslator(config.uiLang);
  const dryRun = options.dryRun === true;
  const saved  = await readPreferences();

  const provider = dryRun
    ? undefined
    : await resolveProvider({
        providers: (deps.createProviders ?? createProviders)(config, {
          ...(saved.anthropicApiKey === undefined ? {} : { anthropicApiKey: saved.anthropicApiKey }),
        }),
        config,
      });

  const decorate = shouldDecorate({ quiet: options.quiet });

  // A caller that handed over a prompt port already has someone answering;
  // otherwise there is only the terminal, and a pipe or a CI log has nobody.
  const prompts = deps.prompts ?? (decorate ? clackPrompts : undefined);

  // Only a run about to spend something has anything worth asking about: a dry
  // run sends nothing, and --quiet is how a script says not to be stopped.
  const canAsk = !dryRun && options.quiet !== true && prompts !== undefined;

  let byProject = false;
  let cancelled = false;
  let pass      = 0;

  // How many projects the last review still had work for, the chosen one aside.
  // At zero the loop stops rather than scanning again to ask a question whose
  // only answer would be "nothing left".
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

/**
 * No eager defaults on the language flags: resolving them here would make
 * `--help` print a different line on every machine. The action resolves them.
 */
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
