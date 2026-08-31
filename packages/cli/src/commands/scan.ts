import path from "node:path";
import { DEFAULT_MANIFEST_PATH, scan, serializeManifest, writeManifest } from "@glosik/core";
import { Command } from "commander";

import { builtinAdapters } from "../registries.js";
import { displayPath, renderScanReport } from "../render.js";

interface ScanOptions {
  json: boolean;
  out?: string;
  write: boolean;
}

export const runScan = async (target: string, options: ScanOptions): Promise<void> => {
  const cwd = process.cwd();
  const root = path.resolve(cwd, target);
  const result = await scan({ root, adapters: builtinAdapters });

  if (options.json) {
    process.stdout.write(serializeManifest(result.manifest));
    return;
  }

  process.stdout.write(renderScanReport(result));

  if (!options.write) return;

  // An explicit --out is the user's path, so it follows the cwd. The default
  // belongs to the scanned project, so it follows the scanned root.
  const manifestPath =
    options.out === undefined
      ? path.resolve(root, DEFAULT_MANIFEST_PATH)
      : path.resolve(cwd, options.out);

  const out = await writeManifest(result.manifest, manifestPath);
  process.stdout.write(`\nmanifest: ${displayPath(cwd, out)}\n`);
};

export const scanCommand = (): Command =>
  new Command("scan")
    .description("analyze workspace structure (static only, no LLM)")
    .argument("[path]", "workspace root", ".")
    .option("--json", "print the manifest to stdout instead of writing it", false)
    .option(
      "--out <path>",
      `manifest destination; relative to the cwd, default <root>/${DEFAULT_MANIFEST_PATH}`,
    )
    .option("--no-write", "print the report only, write no file")
    .action(async (pathArg: string, options: ScanOptions) => {
      await runScan(pathArg, options);
    });
