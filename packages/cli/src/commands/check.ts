import path from "node:path";
import process from "node:process";

import type { CheckResult } from "@glossic/core";
import { check } from "@glossic/core";
import { Command } from "commander";

import { flagsToConfig, resolveEffectiveConfig } from "../config.js";
import { createTranslator } from "../i18n/messages.js";
import { builtinAdapters } from "../registries.js";
import { renderCheckReport } from "../render.js";

export interface CheckCliOptions {
  json?: boolean;
  uiLang?: string;
  out?: string;
}

export const runCheck = async (target: string, options: CheckCliOptions): Promise<CheckResult> => {
  const cwd = process.cwd();
  const root = path.resolve(cwd, target);
  const { config } = await resolveEffectiveConfig({
    root,
    flags: flagsToConfig({ uiLang: options.uiLang }),
  });
  const t = createTranslator(config.uiLang);

  const outDir =
    options.out === undefined
      ? path.resolve(root, config.output.dir)
      : path.resolve(cwd, options.out);

  const result = await check({ root, adapters: builtinAdapters, config, outDir });

  process.stdout.write(
    options.json === true
      ? `${JSON.stringify(result, null, 2)}\n`
      : renderCheckReport(result, { cwd, target, t }),
  );

  if (!result.ok) process.exitCode = 1;
  return result;
};

export const checkCommand = (): Command =>
  new Command("check")
    .description("validate whether the generated docs are stale")
    .argument("[path]", "workspace root", ".")
    .option("--json", "machine-readable output for CI", false)
    .option("--out <dir>", "docs directory; relative to the cwd, default <root>/docs")
    .option("--ui-lang <code>", "language of the CLI itself: en or es")
    .option("-q, --quiet", "no banner", false)
    .action(async (target: string, options: CheckCliOptions) => {
      await runCheck(target, options);
    });
