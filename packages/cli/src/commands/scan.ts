import path from "node:path";
import type { ScanResult } from "@glossic/core";
import { scan, serializeManifest, writeManifest } from "@glossic/core";
import { Command } from "commander";

import { flagsToConfig, resolveEffectiveConfig } from "../config.js";
import { createTranslator } from "../i18n/index.js";
import { builtinAdapters } from "../registries.js";
import { displayPath, renderScanReport } from "../render/index.js";

export interface ScanOptions {
  json: boolean;
  uiLang?: string;
  out?: string;
  write: boolean;
}

/**
 * An explicit --out is the user's path, so it follows the cwd; the default
 * manifest belongs to the scanned project, so it follows the scanned root.
 */
export const runScan = async (target: string, options: ScanOptions): Promise<ScanResult> => {
  const cwd = process.cwd();
  const root = path.resolve(cwd, target);

  const { config } = await resolveEffectiveConfig({
    root,
    flags: flagsToConfig({ uiLang: options.uiLang }),
  });
  const t = createTranslator(config.uiLang);
  const result = await scan({ root, adapters: builtinAdapters, config });

  if (options.json) {
    process.stdout.write(serializeManifest(result.manifest));
    return result;
  }

  process.stdout.write(renderScanReport(result, t));

  if (!options.write) return result;

  const manifestPath =
    options.out === undefined
      ? path.resolve(root, config.output.manifest)
      : path.resolve(cwd, options.out);

  const out = await writeManifest(result.manifest, manifestPath);
  process.stdout.write(`\n${t("scan.manifest", { path: displayPath(cwd, out) })}\n`);

  return result;
};

export const scanCommand = (): Command =>
  new Command("scan")
    .description("analyze workspace structure (static only, no LLM)")
    .argument("[path]", "workspace root", ".")
    .option("--json", "print the manifest to stdout instead of writing it", false)
    .option(
      "--out <path>",
      "manifest destination; relative to the cwd, default <root>/.glossic/manifest.json",
    )
    .option("--no-write", "print the report only, write no file")
    .option("--ui-lang <code>", "language of the CLI itself: en or es")
    .option("-q, --quiet", "no banner", false)
    .action(async (pathArg: string, options: ScanOptions) => {
      await runScan(pathArg, options);
    });
