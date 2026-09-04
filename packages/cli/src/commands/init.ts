import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { CONFIG_FILENAMES, findConfigFile, toPosix } from "@glossic/core";
import { Command } from "commander";

import { resolveEffectiveConfig } from "../config.js";
import { createTranslator } from "../i18n/index.js";


const TEMPLATE = `export default {
  // ── What gets walked ──────────────────────────────────────────────────────

  // Globs an adapter walks, relative to each project root. Replaces, not adds.
  // include: ["**/*"],

  // What your own build emits, never walked into. This list is ADDITIVE: what
  // you write is added to the defaults below, and an entry prefixed with "-"
  // drops that default instead. Code that is not yours — node_modules, vendor,
  // .venv, site-packages and the VCS itself — is the adapter's own hard ignore
  // and is not configurable from here.
  //
  //   exclude: ["**/legacy/**", "-**/out/**"],
  //
  // The defaults it adds to:
  // exclude: [
  //   "**/.gradle/**", "**/.ipynb_checkpoints/**", "**/.mypy_cache/**",
  //   "**/.next/**", "**/.nox/**", "**/.nuxt/**", "**/.pytest_cache/**",
  //   "**/.ruff_cache/**", "**/.svelte-kit/**", "**/.tox/**", "**/.turbo/**",
  //   "**/.vs/**", "**/TestResults/**", "**/*.egg-info/**", "**/.eggs/**",
  //   "**/__pycache__/**", "**/bootstrap/cache/**", "**/build/**",
  //   "**/coverage/**", "**/dist/**", "**/htmlcov/**", "**/obj/**",
  //   "**/out/**", "**/public/assets/**", "**/public/build/**",
  //   "**/public/packs/**", "**/storage/framework/**", "**/target/**",
  //   "**/tmp/**",
  // ],

  // ── How files become units ────────────────────────────────────────────────

  // Adapter ids in priority order; the first whose detect() passes wins.
  // Replaces, not adds: the order is the point.
  // adapters: ["nestjs", "treesitter", "generic"],

  // Files with no documentable content. A unit whose files all match is
  // dropped; the files still count towards the hash of the unit above them.
  // Matched without regard to case, so "Migrations" meets "**/migrations/**".
  // Additive, like exclude: prefix an entry with "-" to drop a default.
  //
  // The defaults it adds to:
  // ignoreUnits: [
  //   "*.config.ts", "*.config.mts", "*.config.cts",
  //   "*.config.js", "*.config.mjs", "*.config.cjs", "*.config.json",
  //   "tsconfig*.json", "package.json", ".*",
  //   "**/bin/**", "**/gen/**", "**/generated-sources/**",
  //   "**/__generated__/**", "**/generated/**", "**/*.generated.*",
  //   "**/migrations/**", "**/migration/**", "**/db/migrate/**",
  //   "**/alembic/versions/**", "**/seeders/**", "**/seeds/**",
  //   "**/factories/**", "**/schema.rb", "**/seeds.rb",
  //   "**/*.designer.cs", "**/*.g.cs", "**/*.g.i.cs",
  //   "**/assemblyinfo.cs", "**/globalusings.g.cs",
  //   "**/*_pb2.py", "**/*_pb2_grpc.py", "**/setup.py", "**/manage.py",
  //   "**/wsgi.py", "**/asgi.py", "**/conftest.py",
  //   "**/*.pb.go", "**/*.pb.gw.go", "**/*_gen.go", "**/*.gen.go",
  //   "**/zz_generated.*", "**/wire_gen.go", "**/*_string.go",
  //   "**/testdata/**", "**/mocks/**",
  //   "**/r.java", "**/buildconfig.java", "**/dagger*.java",
  //   "**/*_factory.java", "**/*_membersinjector.java",
  //   "**/_ide_helper*.php",
  //   "**/bindings.rs", "**/*.gen.rs", "**/benches/**",
  // ],

  // Files that count towards the unit hash but are never sent as content, so
  // the prompt can say the unit is covered without paying for the test code.
  // Additive, like exclude: prefix an entry with "-" to drop a default.
  //
  // The defaults it adds to:
  // excludeFromContent: [
  //   "**/*.test.*", "**/*.spec.*", "**/__tests__/**",
  //   "**/test/**", "**/tests/**", "**/spec/**",
  //   "**/*_test.go", "**/*_test.py", "**/test_*.py",
  //   "**/*_test.rs", "**/*_spec.rb",
  // ],

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
