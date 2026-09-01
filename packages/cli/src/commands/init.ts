import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { CONFIG_FILENAMES, findConfigFile, toPosix } from "@glossic/core";
import { Command } from "commander";

const TEMPLATE = `import { defineConfig } from "@glossic/schema";

export default defineConfig({
  // Adapter ids, resolved in order; the first match wins.
  adapters: ["generic"],

  // Leave unset to auto-detect: claude-code first, then anthropic.
  // provider: "claude-code",
  // model: "claude-opus-5",

  lang: "en",
  concurrency: 3,

  // Files with no documentable content. A unit whose files all match is
  // dropped: it never reaches the manifest, the plan or the provider.
  // ignoreUnits: ["*.config.ts", "tsconfig*.json", "package.json", ".*"],

  // Files that count towards the unit hash — change a test and its unit goes
  // stale — but whose content is never sent to the provider.
  // excludeFromContent: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"],

  // A unit below this many documentable files absorbs its child units. This
  // is what collapses a thin package root plus its src into one document.
  // minUnitFiles: 3,

  // A unit above this many documentable files is split by filename root, so
  // one directory does not turn into a single enormous prompt.
  // maxUnitFiles: 10,

  // Left unset on purpose. The recent Claude models (opus-5, sonnet-5,
  // fable-5, opus-4.7/4.8) reject sampling parameters with a 400, so glossic
  // only forwards this to models that accept it.
  // temperature: 0,

  output: {
    dir: "docs",
    manifest: ".glossic/manifest.json",
    format: "markdown",
  },
});
`;

export const runInit = async (root: string, force: boolean): Promise<string> => {
  const existing = await findConfigFile(root);
  if (existing !== undefined && !force) {
    throw new Error(`${existing} already exists. Pass --force to overwrite it.`);
  }

  const target = path.resolve(root, CONFIG_FILENAMES[0] ?? "glossic.config.ts");
  await fs.writeFile(target, TEMPLATE, "utf8");
  return toPosix(target);
};

export const initCommand = (): Command =>
  new Command("init")
    .description("create glossic.config.ts")
    .argument("[path]", "workspace root", ".")
    .option("-f, --force", "overwrite an existing config", false)
    .option("-q, --quiet", "no banner", false)
    .action(async (target: string, options: { force: boolean }) => {
      const cwd = process.cwd();
      const written = await runInit(path.resolve(cwd, target), options.force);
      process.stdout.write(`created ${toPosix(path.relative(cwd, written)) || written}\n`);
    });
