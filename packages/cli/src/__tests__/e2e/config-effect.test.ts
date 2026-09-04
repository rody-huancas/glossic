import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createFakeProvider, generate, resolveConfig, scan } from "@glossic/core";

import type { GlossicUserConfig } from "@glossic/schema";
import { DEFAULT_EXCLUDE_FROM_CONTENT } from "@glossic/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { builtinAdapters } from "../../registries.js";

const tempDirs: string[] = [];

const SOURCES: Record<string, string> = {
  "package.json"               : '{ "name": "effect-fixture", "type": "module" }\n',
  "tsup.config.ts"             : "export default {};\n",
  "src/index.ts"               : "export const start = 1;\n",
  "src/server.ts"              : "export const server = 2;\n",
  "src/app.ts"                 : "export const app = 3;\n",
  "src/app.test.ts"            : "export const appTest = 1;\n",
  "src/routes/users.ts"        : "export const users = [];\n",
  "src/routes/health.ts"       : "export const health = [];\n",
  "src/utils/logger.ts"        : "export const logger = 1;\n",
  "src/utils/format.ts"        : "export const format = 2;\n",
  "src/migrations/0001-init.ts": "export const up = 1;\n",
  // No role in its name, so it is the one directory minUnitFiles can fold.
  "src/legacy/old-client.ts"   : "export const legacy = 1;\n",
  // Build output: the default exclude keeps both out until a "-" entry lets
  // one in. Two of them, so subtracting one cannot look like dropping all.
  "dist/bundle.ts"             : "export const bundle = 1;\n",
  "coverage/report.ts"         : "export const report = 1;\n",
};

let root: string;
let docs: string;

const write = async (file: string, content: string): Promise<void> => {
  const target = path.join(root, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
};

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-effect-"));
  tempDirs.push(root);
  docs = path.join(root, "docs");

  for (const [file, content] of Object.entries(SOURCES)) await write(file, content);
});

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

/**
 * The real path a config takes, so these tests cover list resolution too:
 * `exclude`, `ignoreUnits` and `excludeFromContent` add to their defaults here,
 * which is what a `glossic.config.ts` actually does.
 */
const config = (values: GlossicUserConfig = {}) => resolveConfig({ project: values }).config;

/** There is no replace mode, so emptying a list means subtracting all of it. */
const drop = (patterns: readonly string[]): string[] => patterns.map((pattern) => `-${pattern}`);

const units = async (values: GlossicUserConfig = {}) => {
  const { manifest } = await scan({ root, adapters: builtinAdapters, config: config(values) });
  return manifest.units;
};

const names = async (values: GlossicUserConfig = {}) =>
  (await units(values)).map((unit) => unit.name);

describe("every option has an effect on scan", () => {
  it("include narrows what is walked", async () => {
    expect(await names({ include: ["src/routes/**"], mergeChildrenInto: 1 })).toEqual([
      "src/routes",
    ]);
  });

  it("exclude removes what would otherwise be walked", async () => {
    expect(await names({ exclude: ["**/routes/**"], mergeChildrenInto: 1 })).not.toContain(
      "src/routes",
    );
  });

  it("an added exclude pattern does not cost the defaults", async () => {
    const added = await names({ exclude: ["**/routes/**"], mergeChildrenInto: 1 });

    // "**/dist/**" is a default, and adding one pattern must not drop it.
    expect(added).not.toContain("src/routes");
    expect(added).not.toContain("dist");
  });

  it("a `-` entry lets one default-excluded directory back in, and only one", async () => {
    const byDefault = await names({ mergeChildrenInto: 1 });

    expect(byDefault).not.toContain("dist");
    expect(byDefault).not.toContain("coverage");

    const relaxed = await names({ exclude: ["-**/dist/**"], mergeChildrenInto: 1 });

    expect(relaxed).toContain("dist");
    expect(relaxed).not.toContain("coverage");
  });

  it("adapters decides which adapter runs, and an empty list means none", async () => {
    expect(await names({ adapters: [] })).toEqual([]);
    expect((await names({ adapters: ["generic"] })).length).toBeGreaterThan(0);
  });

  it("ignoreUnits keeps files out of the documentation", async () => {
    const withDefaults = await units({ mergeChildrenInto: 1 });
    const src          = withDefaults.find((unit) => unit.name === "src");

    // The migration is hashed with the unit above it, never documented.
    expect(src?.facts.base.files.map((file) => file.path)).not.toContain(
      "src/migrations/0001-init.ts",
    );
    expect(src?.facts.base.ignoredFiles.map((file) => file.path)).toContain(
      "src/migrations/0001-init.ts",
    );
  });

  it("excludeFromContent moves a file out of the content and into the tests", async () => {
    const asTest    = await units({ mergeChildrenInto: 1 });
    const asContent = await units({
      mergeChildrenInto : 1,
      excludeFromContent: drop(DEFAULT_EXCLUDE_FROM_CONTENT),
    });

    expect(asTest.find((unit) => unit.name === "src")?.facts.base.testFiles).toHaveLength(1);
    expect(asContent.find((unit) => unit.name === "src")?.facts.base.testFiles).toEqual([]);
  });

  it("mergeChildrenInto collapses the whole tree into one unit", async () => {
    expect(await names({ mergeChildrenInto: 100 })).toHaveLength(1);
    expect((await names({ mergeChildrenInto: 1 })).length).toBeGreaterThan(1);
  });

  it("minUnitFiles decides whether a thin leaf is folded into the unit above it", async () => {
    expect(await names({ mergeChildrenInto: 1, minUnitFiles: 1 })).toContain("src/legacy");

    // Raising the floor folds the role-less leaf and nothing else: "src/routes"
    // and "src/utils" are named for what they hold and keep their own page.
    const raised = await names({ mergeChildrenInto: 1, minUnitFiles: 99 });

    expect(raised).not.toContain("src/legacy");
    expect(raised).toEqual(["src", "src/routes", "src/utils"]);
  });

  it("maxUnitFiles decides whether a unit is split", async () => {
    // A unit that absorbed a subtree is never split again, so the merge has to
    // be off for the ceiling to be the thing under test.
    const whole = await names({ mergeChildrenInto: 1, maxUnitFiles: 10 });
    const split = await names({ mergeChildrenInto: 1, maxUnitFiles: 2 });

    expect(whole).toContain("src");
    expect(split.filter((name) => name.startsWith("src~~")).length).toBeGreaterThan(1);
  });

  it("output.manifest decides where the manifest would go", () => {
    expect(config({ output: { manifest: "docs/manifest.json" } }).output.manifest).toBe(
      "docs/manifest.json",
    );
  });
});

describe("every option has an effect on generate", () => {
  const run = async (values: GlossicUserConfig = {}) => {
    const provider = createFakeProvider();
    const result = await generate({
      root,
      adapters: builtinAdapters,
      config  : config(values),
      provider,
      outDir     : docs,
      cachePath  : path.join(root, ".glossic/cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    return { result, provider };
  };

  it("model and temperature reach the provider", async () => {
    const { provider } = await run({ model: "claude-haiku-4-5", temperature: 0.4 });

    expect(provider.calls[0]?.model).toBe("claude-haiku-4-5");
    expect(provider.calls[0]?.temperature).toBe(0.4);
  });

  it("lang reaches the prompt", async () => {
    const { provider } = await run({ lang: "pt" });
    expect(provider.calls[0]?.prompt).toContain("Write the documentation in pt.");
  });

  it("concurrency caps the completions in flight", async () => {
    let inFlight = 0;
    let peak     = 0;

    const provider = createFakeProvider({
      respond: () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        inFlight -= 1;
        return ["## What it does", "", "A unit of this fixture.".repeat(12)].join("\n");
      },
    });

    await generate({
      root,
      adapters: builtinAdapters,
      config  : config({ mergeChildrenInto: 1, concurrency: 2 }),
      provider,
      outDir     : docs,
      cachePath  : path.join(root, ".glossic/cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("the grouping options invalidate the cache", () => {
  const run = async (values: GlossicUserConfig = {}) => {
    const provider = createFakeProvider();
    const result = await generate({
      root,
      adapters: builtinAdapters,
      config  : config(values),
      provider,
      outDir     : docs,
      cachePath  : path.join(root, ".glossic/cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    return { result, provider };
  };

  it("a second run with the same config is entirely cached", async () => {
    await run({ mergeChildrenInto: 1 });
    const { result, provider } = await run({ mergeChildrenInto: 1 });

    expect(provider.calls).toEqual([]);
    expect(result.fromCache).toBe(result.plan.length);
  });

  it("changing a threshold regroups the units, so nothing is cached", async () => {
    await run({ mergeChildrenInto: 1 });
    const { result } = await run({ mergeChildrenInto: 100 });

    // Different composition means different ids and different hashes.
    expect(result.fromCache).toBe(0);
    expect(result.generated).toBeGreaterThan(0);
  });

  it("changing excludeFromContent changes the hash without moving a file", async () => {
    const before = await units({ mergeChildrenInto: 1 });
    const after  = await units({
      mergeChildrenInto : 1,
      excludeFromContent: drop(DEFAULT_EXCLUDE_FROM_CONTENT),
    });

    const name       = "src";
    const hashBefore = before.find((unit) => unit.name === name)?.hash;
    const hashAfter  = after.find((unit) => unit.name === name)?.hash;

    // Same unit, same files, same digests — only the bucket changed.
    expect(hashBefore).toBeDefined();
    expect(hashAfter).not.toBe(hashBefore);
  });

  it("changing ignoreUnits changes the hash of the unit above", async () => {
    const before = await units({ mergeChildrenInto: 1 });
    const after  = await units({ mergeChildrenInto: 1, ignoreUnits: ["-**/migrations/**"] });

    const src = "src";

    // Dropping that default moves the migration out of the ignored bucket and
    // into the documented one: same file, same digest, different hash.
    expect(before.find((unit) => unit.name === src)?.facts.base.ignoredFiles).toHaveLength(1);
    expect(after.find((unit) => unit.name === src)?.facts.base.ignoredFiles).toEqual([]);

    // The other defaults held: "*.config.ts" still keeps tsup.config.ts out, so
    // the project root never becomes a documented unit of its own.
    expect(after.map((unit) => unit.name)).not.toContain("root");

    expect(after.find((unit) => unit.name === src)?.hash).not.toBe(
      before.find((unit) => unit.name === src)?.hash,
    );
  });

  it("adding an ignoreUnits pattern the default already covers changes nothing", async () => {
    const before = await units({ mergeChildrenInto: 1 });
    const after  = await units({ mergeChildrenInto: 1, ignoreUnits: ["tsup.config.ts"] });

    // "*.config.ts" is a default, so naming this file again is a no-op. Under
    // the old replace semantics it silently dropped the other fifty-four.
    expect(after.map((unit) => [unit.id, unit.hash])).toEqual(
      before.map((unit) => [unit.id, unit.hash]),
    );
  });

  it("a threshold change that regroups nothing leaves the cache alone", async () => {
    await run({ mergeChildrenInto: 1, maxUnitFiles: 10 });
    const { result, provider } = await run({ mergeChildrenInto: 1, maxUnitFiles: 11 });

    // Nothing was grouped differently, so nothing needed rewriting.
    expect(provider.calls).toEqual([]);
    expect(result.fromCache).toBe(result.plan.length);
  });
});

describe("a tree that folded a thin leaf", () => {
  const folded = { mergeChildrenInto: 1, minUnitFiles: 99 } as const;

  it("keeps the same ids and hashes on two consecutive runs", async () => {
    const first  = await units(folded);
    const second = await units(folded);

    // The fold is what is under test, so it has to have happened.
    expect(first.map((unit) => unit.name)).not.toContain("src/legacy");
    expect(second.map((unit) => [unit.id, unit.hash])).toEqual(
      first.map((unit) => [unit.id, unit.hash]),
    );
  });
});
