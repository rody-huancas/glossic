import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { CONFIG_FILENAMES, findConfigFile, toPosix } from "@glossic/core";
import { Command } from "commander";

import { resolveEffectiveConfig } from "../config.js";
import { createTranslator } from "../i18n/index.js";

/**
 * Every option, its real default, and one line on what it does. Commented out
 * so the file starts as a no-op: what is written here overrides the defaults
 * and the saved preference, but never a flag.
 *
 * The type arrives through `satisfies` and an inline `import(...)` type, never
 * a real import: an import that the project running glossic cannot resolve —
 * and it has no reason to have `@glossic/schema` installed — makes the whole
 * file unloadable, while a type that does not resolve costs nothing at all.
 */
const TEMPLATE = `export default {
  // ── What gets walked ──────────────────────────────────────────────────────

  // Globs an adapter walks, relative to each project root.
  // include: ["**/*"],

  // Globs never walked into, on top of the adapter's own hard ignores.
  // exclude: ["**/node_modules/**", "**/dist/**", "**/vendor/**"],

  // ── How files become units ────────────────────────────────────────────────

  // Adapter ids in priority order; the first whose detect() passes wins.
  // adapters: ["nestjs", "treesitter", "generic"],

  // Files with no documentable content. A unit whose files all match is
  // dropped; the files still count towards the hash of the unit above them.
  // ignoreUnits: [
  //   "*.config.ts", "*.config.mts", "*.config.cts",
  //   "*.config.js", "*.config.mjs", "*.config.cjs", "*.config.json",
  //   "tsconfig*.json", "package.json", ".*",
  //   "**/migrations/**", "**/migration/**",
  //   "**/seeders/**", "**/seeds/**",
  //   "**/__generated__/**", "**/generated/**", "**/*.generated.*",
  // ],

  // Files that count towards the unit hash but are never sent as content, so
  // the prompt can say the unit is covered without paying for the test code.
  // excludeFromContent: ["**/*.test.*", "**/*.spec.*", "**/__tests__/**"],

  // A directory absorbs every descendant directory when their documentable
  // files together stay at or below this. Turns a module and its dto,
  // entities and strategies folders into one unit.
  // mergeChildrenInto: 25,

  // A leaf unit below this many documentable files is folded into the unit
  // above it. A directory that has subdirectories of its own, or whose name
  // gives away its role, stays where it is.
  // minUnitFiles: 3,

  // A unit above this many documentable files is split by filename root.
  // maxUnitFiles: 10,

  // ── Who writes the prose ──────────────────────────────────────────────────

  // Provider id. Left unset it auto-detects: claude-code, then anthropic.
  // provider: "claude-code",

  // Model the provider should use. Left unset the provider picks its own.
  // model: "claude-opus-5",

  // ISO 639-1 code the documentation is written in. Left unset it follows
  // your saved preference, then the system locale, then English.
  // lang: "en",

  // Sampling temperature. Left unset on purpose: the recent Claude models
  // reject sampling parameters, so each provider decides whether to send it.
  // temperature: 0,

  // Completions in flight at once.
  // concurrency: 3,

  // Milliseconds before a single completion is abandoned. The claude-code CLI
  // boots a whole agent before answering, which is why this is generous.
  // timeoutMs: 300000,

  // ── Where it goes ─────────────────────────────────────────────────────────

  // output: {
  //   // Where \`generate\` writes, relative to the workspace root.
  //   dir: "docs",
  //   // Where \`scan\` writes, relative to the workspace root.
  //   manifest: ".glossic/manifest.json",
  // },
} satisfies import("@glossic/schema").GlossicUserConfig;
`;

/** Writes glossic.config.ts and returns its path, refusing to overwrite one unless forced. */
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
    .option("--ui-lang <code>", "language of the CLI itself: en or es")
    .option("-q, --quiet", "no banner", false)
    .action(async (target: string, options: { force: boolean; uiLang?: string }) => {
      const cwd  = process.cwd();
      const root = path.resolve(cwd, target);

      const { config } = await resolveEffectiveConfig({
        root,
        ...(options.uiLang === undefined
          ? {}
          : { flags: { uiLang: options.uiLang as "en" | "es" } }),
      });

      const written = await runInit(root, options.force);
      const t       = createTranslator(config.uiLang);

      process.stdout.write(
        `${t("init.created", { path: toPosix(path.relative(cwd, written)) || written })}\n`,
      );
    });
