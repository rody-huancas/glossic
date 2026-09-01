import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GenerateContext, GenerateResult } from "@glossic/core";
import { createFakeProvider, generate, readCache } from "@glossic/core";
import { GlossicConfigSchema } from "@glossic/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { builtinAdapters } from "../../registries.js";

/**
 * These tests are about the cache and the checker, not the unit grouping, so
 * they keep the fixture as one unit per directory.
 */
const TREE_CONFIG = GlossicConfigSchema.parse({ mergeChildrenInto: 1 });

const tempDirs: string[] = [];

/**
 * Three files directly under src keeps it at the merge floor, so these tests
 * exercise the cache and the checker rather than the unit grouping.
 */
const SOURCES: Record<string, string> = {
  "package.json": '{ "name": "cache-fixture", "type": "module" }\n',
  "src/index.ts": 'export const start = (): string => "up";\n',
  "src/server.ts": "export const server = { port: 3000 };\n",
  "src/app.ts": "export const app = { started: false };\n",
  "src/routes/users.routes.ts": "export const usersRoutes = [];\n",
  "src/routes/health.routes.ts": "export const healthRoutes = [];\n",
  "src/utils/logger.ts": "export const logger = console;\n",
  "src/utils/format.ts": "export const format = (v: string): string => v.trim();\n",
};

interface Fixture {
  root: string;
  docs: string;
  cachePath: string;
}

const makeFixture = async (): Promise<Fixture> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-cache-"));
  tempDirs.push(root);

  for (const [file, content] of Object.entries(SOURCES)) {
    const target = path.join(root, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }

  return {
    root,
    docs: path.join(root, "docs"),
    cachePath: path.join(root, ".glossic", "cache.json"),
  };
};

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

let fixture: Fixture;

beforeEach(async () => {
  fixture = await makeFixture();
});

const run = async (
  overrides: Partial<GenerateContext> = {},
): Promise<{ result: GenerateResult; provider: ReturnType<typeof createFakeProvider> }> => {
  const provider = createFakeProvider();
  const result = await generate({
    root: fixture.root,
    adapters: builtinAdapters,
    config: TREE_CONFIG,
    provider,
    outDir: fixture.docs,
    cachePath: fixture.cachePath,
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
  return { result, provider };
};

const regenerated = (result: GenerateResult): string[] =>
  result.plan.filter((entry) => entry.regenerate).map((entry) => entry.unitId);

describe("incremental cache", () => {
  it("generates everything on a cold run and records it", async () => {
    const { result, provider } = await run();

    expect(result.generated).toBe(3);
    expect(result.fromCache).toBe(0);
    expect(provider.calls).toHaveLength(3);

    const cache = await readCache(fixture.cachePath);
    expect(cache.entries.map((entry) => entry.unitId).sort()).toEqual([
      "root:src",
      "root:src/routes",
      "root:src/utils",
    ]);
    expect(cache.entries[0]).toMatchObject({
      promptVersion: "3",
      model: "default",
      lang: "en",
      outputPath: "src.md",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("never calls the provider on a fully cached second run", async () => {
    await run();
    const { result, provider } = await run();

    expect(provider.calls).toEqual([]);
    expect(result.generated).toBe(0);
    expect(result.fromCache).toBe(3);
    expect(result.estimatedTokens).toBe(0);
    expect(result.savedTokens).toBeGreaterThan(0);
    expect(result.plan.every((entry) => entry.reason === "cached")).toBe(true);
  });

  it("invalidates only the unit whose content changed", async () => {
    await run();
    await fs.writeFile(
      path.join(fixture.root, "src/utils/logger.ts"),
      "export const logger = { info: console.log };\n",
      "utf8",
    );

    const { result, provider } = await run();

    expect(regenerated(result)).toEqual(["root:src/utils"]);
    expect(result.fromCache).toBe(2);
    expect(provider.calls).toHaveLength(1);
    expect(result.plan.find((entry) => entry.unitId === "root:src/utils")?.reason).toBe(
      "content-changed",
    );
  });

  it("invalidates everything when PROMPT_VERSION changes", async () => {
    await run();

    const cache = await readCache(fixture.cachePath);
    await fs.writeFile(
      fixture.cachePath,
      JSON.stringify(
        { ...cache, entries: cache.entries.map((entry) => ({ ...entry, promptVersion: "0" })) },
        null,
        2,
      ),
      "utf8",
    );

    const { result, provider } = await run();

    expect(result.generated).toBe(3);
    expect(result.fromCache).toBe(0);
    expect(provider.calls).toHaveLength(3);
    expect(result.plan.every((entry) => entry.reason === "prompt-version-changed")).toBe(true);
  });

  it("invalidates everything when the model changes", async () => {
    await run();

    const { result } = await run({
      config: { ...TREE_CONFIG, model: "claude-haiku-4-5" },
    });

    expect(result.generated).toBe(3);
    expect(result.plan.every((entry) => entry.reason === "model-changed")).toBe(true);
  });

  it("invalidates everything when the language changes", async () => {
    await run();

    const { result } = await run({ config: { ...TREE_CONFIG, lang: "es" } });

    expect(result.generated).toBe(3);
    expect(result.plan.every((entry) => entry.reason === "lang-changed")).toBe(true);
  });

  it("regenerates a unit whose document was deleted", async () => {
    await run();
    await fs.rm(path.join(fixture.docs, "src/routes.md"));

    const { result } = await run();

    expect(regenerated(result)).toEqual(["root:src/routes"]);
    expect(result.plan.find((entry) => entry.unitId === "root:src/routes")?.reason).toBe(
      "output-missing",
    );
  });

  it("--force ignores the cache", async () => {
    await run();
    const { result, provider } = await run({ force: true });

    expect(result.generated).toBe(3);
    expect(result.fromCache).toBe(0);
    expect(provider.calls).toHaveLength(3);
    expect(result.plan.every((entry) => entry.reason === "forced")).toBe(true);
  });

  it("--only restricts the run and leaves the rest alone", async () => {
    await run();
    for (const file of ["src/index.ts", "src/utils/logger.ts"]) {
      await fs.appendFile(path.join(fixture.root, file), "// touched\n", "utf8");
    }

    const { result, provider } = await run({ only: "src/utils" });

    expect(result.plan.map((entry) => entry.unitId)).toEqual(["root:src/utils"]);
    expect(result.filteredOut).toEqual(["root:src", "root:src/routes"]);
    expect(provider.calls).toHaveLength(1);

    // The untouched entries must survive so the next full run still sees them.
    const cache = await readCache(fixture.cachePath);
    expect(cache.entries).toHaveLength(3);
  });

  it("--only accepts a glob", async () => {
    const children = await run({ only: "src/*" });
    expect(children.result.plan.map((entry) => entry.unitId)).toEqual([
      "root:src/routes",
      "root:src/utils",
    ]);

    // picomatch semantics: "src/**" covers "src" itself as well as its children.
    fixture = await makeFixture();
    const subtree = await run({ only: "src/**" });
    expect(subtree.result.plan.map((entry) => entry.unitId)).toEqual([
      "root:src",
      "root:src/routes",
      "root:src/utils",
    ]);
  });

  it("drops cache entries for units that disappeared", async () => {
    await run();
    await fs.rm(path.join(fixture.root, "src/utils"), { force: true, recursive: true });

    await run();

    const cache = await readCache(fixture.cachePath);
    expect(cache.entries.map((entry) => entry.unitId)).toEqual(["root:src", "root:src/routes"]);
  });

  it("survives a corrupted cache file by regenerating", async () => {
    await run();
    await fs.writeFile(fixture.cachePath, "{ not json", "utf8");

    const { result } = await run();
    expect(result.generated).toBe(3);
  });
});
