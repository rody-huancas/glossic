import path from "node:path";
import process from "node:process";

import type { GenerateResult } from "@glossic/core";
import { generate, resolveProvider } from "@glossic/core";
import { Command } from "commander";

import { flagsToConfig, resolveEffectiveConfig } from "../config.js";
import { builtinAdapters, createProviders } from "../registries.js";
import { renderGenerateReport } from "../render.js";
import { shouldDecorate } from "../ui/banner.js";
import { createGenerateProgress } from "../ui/progress.js";

export interface GenerateCliOptions {
  dryRun?: boolean;
  provider?: string;
  out?: string;
  lang?: string;
  model?: string;
  concurrency?: string;
  force?: boolean;
  only?: string;
  quiet?: boolean;
}

const parseConcurrency = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--concurrency must be a positive integer, got "${value}"`);
  }
  return parsed;
};

export const runGenerate = async (
  target: string,
  options: GenerateCliOptions,
): Promise<GenerateResult> => {
  const cwd = process.cwd();
  const root = path.resolve(cwd, target);

  // One chain for every option: flags, then glossic.config.ts, then the saved
  // preference, then the schema's defaults.
  const { config, origins } = await resolveEffectiveConfig({
    root,
    flags: flagsToConfig({
      lang: options.lang,
      provider: options.provider,
      model: options.model,
      concurrency: parseConcurrency(options.concurrency),
    }),
  });

  // An explicit --out is the user's path, so it follows the cwd. Anything from
  // the config belongs to the project, so it follows the scanned root.
  const outDir =
    options.out === undefined
      ? path.resolve(root, config.output.dir)
      : path.resolve(cwd, options.out);

  const dryRun = options.dryRun === true;
  const provider = dryRun
    ? undefined
    : await resolveProvider({ providers: createProviders(config), config });

  // A dry run has nothing to watch: it never calls the provider.
  const progress =
    dryRun || !shouldDecorate({ quiet: options.quiet }) ? undefined : createGenerateProgress();

  const result = await generate({
    root,
    adapters: builtinAdapters,
    config,
    outDir,
    dryRun,
    force: options.force === true,
    ...(options.only === undefined ? {} : { only: options.only }),
    ...(provider === undefined ? {} : { provider }),
    ...(progress === undefined ? {} : { onEvent: progress.onEvent }),
  });

  progress?.finish("");
  process.stdout.write(
    renderGenerateReport(result, {
      outDir,
      cwd,
      provider: provider?.name,
      language: { code: config.lang, origin: origins.lang ?? "default" },
    }),
  );

  // A unit that failed does not abort the run, but it must not pass for CI.
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
    // No eager defaults: resolving them here would make `--help` print a
    // different line on every machine. The action resolves them instead.
    .option("--lang <code>", "language of the documentation (default: system language)")
    .option("--concurrency <n>", "parallel completions (default: 3)")
    .option("--force", "ignore the cache and regenerate everything", false)
    .option("--only <glob>", "regenerate only the units matching this glob")
    .option("-q, --quiet", "no banner and no spinner", false)
    .action(async (target: string, options: GenerateCliOptions) => {
      await runGenerate(target, options);
    });
