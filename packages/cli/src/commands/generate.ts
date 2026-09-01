import path from "node:path";
import process from "node:process";

import type { GenerateResult } from "@glossic/core";
import { generate, resolveProvider } from "@glossic/core";
import { GlossicConfigSchema } from "@glossic/schema";
import { Command } from "commander";

import { detectLanguage } from "../language.js";
import { builtinAdapters, builtinProviders } from "../registries.js";
import { renderGenerateReport } from "../render.js";
import { shouldDecorate } from "../ui/banner.js";
import { createGenerateProgress } from "../ui/progress.js";

export interface GenerateCliOptions {
  dryRun?: boolean;
  provider?: string;
  out?: string;
  lang?: string;
  concurrency?: string;
  force?: boolean;
  only?: string;
  quiet?: boolean;
}

const parseConcurrency = (value: string | undefined, fallback: number): number => {
  if (value === undefined) return fallback;
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

  const config = GlossicConfigSchema.parse({
    lang: options.lang ?? detectLanguage(),
    concurrency: parseConcurrency(options.concurrency, 3),
  });

  // An explicit --out is the user's path, so it follows the cwd. The default
  // belongs to the scanned project, so it follows the scanned root.
  const outDir =
    options.out === undefined
      ? path.resolve(root, config.output.dir)
      : path.resolve(cwd, options.out);

  const dryRun = options.dryRun === true;
  const provider = dryRun
    ? undefined
    : await resolveProvider({
        providers: builtinProviders,
        config,
        ...(options.provider === undefined ? {} : { requested: options.provider }),
      });

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
  process.stdout.write(renderGenerateReport(result, { outDir, cwd, provider: provider?.name }));

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
    .option("--out <dir>", "docs destination; relative to the cwd, default <root>/docs")
    // No eager default: resolving the locale here would make `--help` print a
    // different line on every machine. The action resolves it instead.
    .option("--lang <code>", "language of the documentation (default: system language)")
    .option("--concurrency <n>", "parallel completions", "3")
    .option("--force", "ignore the cache and regenerate everything", false)
    .option("--only <glob>", "regenerate only the units matching this glob")
    .option("-q, --quiet", "no banner and no spinner", false)
    .action(async (target: string, options: GenerateCliOptions) => {
      await runGenerate(target, options);
    });
