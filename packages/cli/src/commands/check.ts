import path from "node:path";
import process from "node:process";

import type { CheckResult } from "@glossic/core";
import { Command } from "commander";
import { check, readManifest } from "@glossic/core";

import { resolveDocsDir } from "../docs-dir.js";
import { builtinAdapters } from "../registries.js";
import { createTranslator } from "../i18n/index.js";
import { flagsToConfig, resolveEffectiveConfig } from "../config.js";
import { renderCheckReport, renderUnmatchedRemovals } from "../render/index.js";

/** `out` is the old name of `docs`, kept working for one more major. */
export interface CheckCliOptions {
  json  ?: boolean;
  uiLang?: string;
  docs  ?: string;
  out   ?: string;
}

export const runCheck = async (target: string, options: CheckCliOptions): Promise<CheckResult> => {
  const cwd  = process.cwd();
  const root = path.resolve(cwd, target);
  const { config, lists } = await resolveEffectiveConfig({
    root,
    flags: flagsToConfig({ uiLang: options.uiLang }),
  });
  const t = createTranslator(config.uiLang);

  if (options.out !== undefined) process.stderr.write(`${t("check.outDeprecated")}\n`);

  process.stderr.write(renderUnmatchedRemovals(lists, t));

  const recorded = await readManifest(path.resolve(root, config.output.manifest));
  const outDir   = resolveDocsDir(
    { cwd, root },
    options.docs ?? options.out,
    recorded?.docsDir,
    config.output.dir,
  );

  const result = await check({ root, adapters: builtinAdapters, config, outDir });

  process.stdout.write( options.json === true
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
    .option("--docs <dir>", "where the generated markdown is; relative to the cwd, default <root>/docs")
    .option("--out <dir>", "deprecated alias for --docs")
    .option("--ui-lang <code>", "language of the CLI itself: en or es")
    .option("-q, --quiet", "no banner", false)
    .action(async (target: string, options: CheckCliOptions) => {
      await runCheck(target, options);
    });
