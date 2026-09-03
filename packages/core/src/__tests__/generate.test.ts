import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Adapter, DiscoverContext, DiscoveredUnit, ExtractContext, Provider } from "@glossic/schema";
import { GlossicConfigSchema, ProviderError } from "@glossic/schema";
import { afterAll, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { generate } from "../generate/index.js";
import type { PlanReview, PlanReviewer } from "../generate/index.js";
import { exampleDir } from "../test-utils.js";
import { createFakeProvider } from "../testing.js";

/** Long enough to pass the document validation the pipeline applies. */
const OK_DOCUMENT = [
  "## What it does",
  "",
  "Wires the unit together and exposes its public surface.",
  "",
  "## Responsibilities",
  "",
  "It owns its own behaviour and delegates the rest to its neighbours, so the",
  "dependency direction stays one way and the boundary stays legible.",
].join("\n");

const tempDirs: string[] = [];

const outDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-docs-"));
  tempDirs.push(dir);
  return dir;
};

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

/**
 * Minimal adapter: keeps this test about `generate`, not about how the generic
 * adapter walks a tree.
 */
const fakeAdapter: Adapter = {
  name  : "fake",
  detect: async (): Promise<boolean> => true,
  discover: async (ctx: DiscoverContext): Promise<DiscoveredUnit[]> => [
    {
      id          : `${ctx.project.id}:src/config`,
      projectId   : ctx.project.id,
      name        : "src/config",
      path        : "src/config",
      files       : ["src/config/app.config.ts"],
      testFiles   : [],
      ignoredFiles: [],
    },
    {
      id          : `${ctx.project.id}:src/users/dto`,
      projectId   : ctx.project.id,
      name        : "src/users/dto",
      path        : "src/users/dto",
      files       : ["src/users/dto/create-user.dto.ts"],
      testFiles   : [],
      ignoredFiles: [],
    },
  ],
  extract: async (ctx: ExtractContext) => ({
    units: ctx.units.map((discovered) => ({
      id       : discovered.id,
      projectId: discovered.projectId,
      kind     : "directory" as const,
      name     : discovered.name,
      path     : discovered.path,
      facts: {
        base: {
          files: discovered.files.map((file) => ({
            path    : file,
            language: "typescript",
            bytes   : 1,
          })),
          testFiles   : [],
          ignoredFiles: [],
          languages   : [{ language: "typescript", count: discovered.files.length }],
          roleHint    : discovered.name.endsWith("dto") ? ("dtos" as const) : ("config" as const),
        },
        producedBy: ["fake"],
      },
      hash: `hash-${discovered.name}`,
    })),
    relations: [],
  }),
};

/**
 * As many units as a test asks for, every one of them reading the same real
 * file: what these drive is the loop over the plan, not the sources.
 */
const wideAdapter = (names: readonly string[]): Adapter => ({
  name  : "wide",
  detect: async (): Promise<boolean> => true,
  discover: async (ctx: DiscoverContext): Promise<DiscoveredUnit[]> =>
    names.map((name) => ({
      id          : `${ctx.project.id}:src/${name}`,
      projectId   : ctx.project.id,
      name        : `src/${name}`,
      path        : `src/${name}`,
      files       : ["src/main.ts"],
      testFiles   : [],
      ignoredFiles: [],
    })),
  extract: fakeAdapter.extract,
});

/** The adapter has to be named in the config, or it is never tried. */
const FAKE_CONFIG = GlossicConfigSchema.parse({ adapters: ["fake"] });

/** One at a time, so "the unit it stopped on" is a single, predictable unit. */
const WIDE_CONFIG = GlossicConfigSchema.parse({ adapters: ["wide"], concurrency: 1 });

const UNIT_NAMES = ["a", "b", "c", "d", "e"];

/**
 * Two units inside every project the workspace turns out to have, so a run can
 * be split along project lines. They all read the same file at the root, which
 * every project can reach.
 */
const perProjectAdapter: Adapter = {
  name  : "per-project",
  detect: async (): Promise<boolean> => true,
  discover: async (ctx: DiscoverContext): Promise<DiscoveredUnit[]> =>
    ["one", "two"].map((name) => ({
      id          : `${ctx.project.id}:src/${name}`,
      projectId   : ctx.project.id,
      name        : `src/${name}`,
      path        : `${ctx.project.rootDir}/src/${name}`,
      files       : ["package.json"],
      testFiles   : [],
      ignoredFiles: [],
    })),
  extract: fakeAdapter.extract,
};

/** The adapter has to be named in the config, or it is never tried. */
const PER_PROJECT_CONFIG = GlossicConfigSchema.parse({ adapters: ["per-project"] });

/** A provider that fails `failOn` with `code` and answers everything else. */
const failingAt = (failOn: string, code: ProviderError["code"], message: string) =>
  createFakeProvider({
    respond: (request) => {
      if (request.metadata.unitId === failOn) {
        throw new ProviderError({ provider: "fake", code, message });
      }
      return OK_DOCUMENT;
    },
  });

/** A provider that spends its quota on `failOn` and answers everything else. */
const quotaAt = (failOn: string) =>
  failingAt(failOn, "quota", "Claude AI usage limit reached");

const run = async (overrides: Partial<Parameters<typeof generate>[0]> = {}) =>
  generate({
    root    : exampleDir("nestjs-api"),
    adapters: [fakeAdapter],
    config  : FAKE_CONFIG,
    outDir  : await outDir(),
    // Never the fixture's own .glossic: tests must not leave state in the repo.
    cachePath  : path.join(await outDir(), "cache.json"),
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

describe("generate --dry-run", () => {
  it("never calls the provider", async () => {
    const provider = createFakeProvider();
    const result   = await run({ provider, dryRun: true });

    expect(provider.calls).toEqual([]);
    expect(result.dryRun).toBe(true);
    expect(result.written).toEqual([]);
  });

  it("writes no file at all", async () => {
    const docs = await outDir();
    await run({ provider: createFakeProvider(), dryRun: true, outDir: docs });

    await expect(fs.readdir(docs)).resolves.toEqual([]);
  });

  it("plans every unit and estimates tokens", async () => {
    const result = await run({ dryRun: true });

    expect(result.plan.map((entry) => entry.unitId)).toEqual([
      "root:src/config",
      "root:src/users/dto",
    ]);
    expect(result.plan.map((entry) => entry.docPath)).toEqual([
      "src/config.md",
      "src/users/dto.md",
    ]);
    expect(result.estimatedTokens).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBe(
      result.plan.reduce((sum, entry) => sum + entry.estimatedTokens, 0),
    );
  });

  it("treats a missing provider as a dry run", async () => {
    const result = await run();
    expect(result.dryRun).toBe(true);
  });
});

describe("generate", () => {
  it("writes one document per unit plus an index", async () => {
    const docs   = await outDir();
    const result = await run({ provider: createFakeProvider(), outDir: docs });

    expect(result.written).toEqual(["index.md", "src/config.md", "src/users/dto.md"]);

    const doc   = await fs.readFile(path.join(docs, "src/users/dto.md"), "utf8");
    const match = /^---\n([\s\S]*?)\n---\n/.exec(doc);
    expect(match).not.toBeNull();
    expect(parseYaml(match?.[1] ?? "")).toEqual({
      title      : "src/users/dto",
      unit       : "root:src/users/dto",
      project    : "root",
      path       : "src/users/dto",
      role       : "dtos",
      hash       : "hash-src/users/dto",
      files      : 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("sends the facts and the file contents to the provider", async () => {
    const provider = createFakeProvider();
    await run({ provider, outDir: await outDir() });

    const request = provider.calls.find((call) =>
      call.prompt.includes("src/users/dto/create-user.dto.ts"),
    );

    expect(request?.system).toContain("Never invent behaviour");
    expect(request?.prompt).toContain("folder role hint: dtos");
    expect(request?.prompt).toContain("export class CreateUserDto");
    expect(request?.metadata).toEqual({ unitId: "root:src/users/dto", projectId: "root" });
  });

  it("writes the language instruction into the prompt", async () => {
    const provider = createFakeProvider();
    await run({
      provider,
      outDir: await outDir(),
      config: GlossicConfigSchema.parse({ adapters: ["fake"], lang: "es" }),
    });

    expect(provider.calls[0]?.prompt).toContain("Write the documentation in es.");
  });

  it("keeps going when one unit fails and reports it", async () => {
    const provider = createFakeProvider({
      respond: (request) => {
        if (request.metadata.unitId === "root:src/config") {
          throw new ProviderError({
            provider: "fake",
            code    : "api",
            message : "rate limited",
          });
        }
        return OK_DOCUMENT;
      },
    });

    const docs   = await outDir();
    const result = await run({ provider, outDir: docs });

    expect(result.failures).toEqual([
      { unitId: "root:src/config", reason: "rate limited", code: "api", detail: undefined },
    ]);
    expect(result.written).toEqual(["index.md", "src/users/dto.md"]);
  });

  it("attaches the generated prose to the returned manifest", async () => {
    const result = await run({ provider: createFakeProvider(), outDir: await outDir() });

    expect(result.manifest.units.every((unit) => unit.summary !== undefined)).toBe(true);
  });

  it("respects the concurrency limit", async () => {
    let inFlight = 0;
    let peak     = 0;

    const provider = createFakeProvider({
      respond: () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        inFlight -= 1;
        return OK_DOCUMENT;
      },
    });

    await run({ provider, outDir: await outDir() });
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("when the provider runs out of quota", () => {
  const wideRun = async (options: { provider: Provider; outDir: string; cachePath: string }) =>
    generate({
      root       : exampleDir("nestjs-api"),
      adapters   : [wideAdapter(UNIT_NAMES)],
      config     : WIDE_CONFIG,
      generatedAt: "2026-01-01T00:00:00.000Z",
      ...options,
    });

  it("stops the rest of the plan instead of failing every unit in turn", async () => {
    const provider = quotaAt("root:src/b");
    const result   = await wideRun({
      provider,
      outDir   : await outDir(),
      cachePath: path.join(await outDir(), "cache.json"),
    });

    // Two calls for five units: the wall is hit once, not once per unit.
    expect(provider.calls).toHaveLength(2);
    expect(result.skipped).toEqual(["root:src/c", "root:src/d", "root:src/e"]);
    expect(result.aborted).toEqual({
      unitId   : "root:src/b",
      code     : "quota",
      reason   : "Claude AI usage limit reached",
      remaining: 3,
    });
  });

  it("keeps the unit that hit the wall in the failures, and no other", async () => {
    const result = await wideRun({
      provider : quotaAt("root:src/b"),
      outDir   : await outDir(),
      cachePath: path.join(await outDir(), "cache.json"),
    });

    expect(result.failures.map((failure) => failure.unitId)).toEqual(["root:src/b"]);
    expect(result.generated).toBe(1);
  });

  it("writes and caches what it did generate, so the next run continues", async () => {
    const docs  = await outDir();
    const cache = path.join(await outDir(), "cache.json");

    const first = await wideRun({ provider: quotaAt("root:src/b"), outDir: docs, cachePath: cache });

    expect(first.written).toEqual(["index.md", "src/a.md"]);
    await expect(fs.readFile(path.join(docs, "src/a.md"), "utf8")).resolves.toContain("## What it does");

    const provider = createFakeProvider();
    const second   = await wideRun({ provider, outDir: docs, cachePath: cache });

    // The unit the first run paid for is not paid for twice.
    expect(provider.calls.map((call) => call.metadata.unitId)).toEqual([
      "root:src/b",
      "root:src/c",
      "root:src/d",
      "root:src/e",
    ]);
    expect(second.aborted).toBeUndefined();
    expect(second.skipped).toEqual([]);
    expect(second.fromCache).toBe(1);
  });

  it("keeps going for a failure that is only this unit's problem", async () => {
    const provider = createFakeProvider({
      respond: (request) => {
        if (request.metadata.unitId === "root:src/b") {
          throw new ProviderError({ provider: "fake", code: "api", message: "malformed request" });
        }
        return OK_DOCUMENT;
      },
    });

    const result = await wideRun({
      provider,
      outDir   : await outDir(),
      cachePath: path.join(await outDir(), "cache.json"),
    });

    expect(provider.calls).toHaveLength(5);
    expect(result.aborted).toBeUndefined();
    expect(result.skipped).toEqual([]);
    expect(result.generated).toBe(4);
  });
});

describe("the other failures nothing else in the run would survive", () => {
  const wideRun = async (options: { provider: Provider; outDir: string; cachePath: string }) =>
    generate({
      root       : exampleDir("nestjs-api"),
      adapters   : [wideAdapter(UNIT_NAMES)],
      config     : WIDE_CONFIG,
      generatedAt: "2026-01-01T00:00:00.000Z",
      ...options,
    });

  it.each([
    ["unauthenticated", "claude is not signed in"],
    ["not-installed", '"claude" was not found in PATH'],
  ] as const)("stops on the first unit for a %s provider", async (code, message) => {
    const provider = failingAt("root:src/a", code, message);

    const result = await wideRun({
      provider,
      outDir   : await outDir(),
      cachePath: path.join(await outDir(), "cache.json"),
    });

    // One call, not five: no session and no binary are facts about the machine.
    expect(provider.calls).toHaveLength(1);
    expect(result.aborted).toMatchObject({ unitId: "root:src/a", code, remaining: 4 });
    expect(result.generated).toBe(0);
  });
});

describe("generating one project at a time", () => {
  const monorepoRun = async (options: {
    provider   : Provider;
    outDir     : string;
    cachePath  : string;
    reviewPlan?: PlanReviewer;
  }) =>
    generate({
      root       : exampleDir("monorepo"),
      adapters   : [perProjectAdapter],
      config     : PER_PROJECT_CONFIG,
      generatedAt: "2026-01-01T00:00:00.000Z",
      ...options,
    });

  it("offers the review one entry per project, with what each still costs", async () => {
    let seen: PlanReview | undefined;

    await monorepoRun({
      provider  : createFakeProvider(),
      outDir    : await outDir(),
      cachePath : path.join(await outDir(), "cache.json"),
      reviewPlan: async (review) => {
        seen = review;
        return [];
      },
    });

    expect(seen?.projects.map((project) => project.id)).toEqual(["packages/api", "packages/web"]);
    expect(seen?.pending).toBe(seen?.projects.reduce((sum, one) => sum + one.pending, 0));
    expect(seen?.estimatedTokens).toBeGreaterThan(0);
    expect(seen?.cached).toBe(0);
  });

  it("sends only the units of the project the review kept", async () => {
    const provider = createFakeProvider();

    const result = await monorepoRun({
      provider,
      outDir    : await outDir(),
      cachePath : path.join(await outDir(), "cache.json"),
      reviewPlan: async () => ["packages/api"],
    });

    const asked = provider.calls.map((call) => String(call.metadata.projectId));

    expect(asked.length).toBeGreaterThan(0);
    expect([...new Set(asked)]).toEqual(["packages/api"]);

    expect(result.plan.every((entry) => entry.unitId.startsWith("packages/api:"))).toBe(true);
    expect(result.written.every((page) => page === "index.md" || page.startsWith("packages/api/"))).toBe(true);

    // The units of the other project were not planned, so they are reported as
    // left out rather than silently missing from the run.
    expect(result.filteredOut.every((id) => id.startsWith("packages/web:"))).toBe(true);
    expect(result.filteredOut.length).toBeGreaterThan(0);
  });

  it("takes only what is still missing on the next pass, and marks the rest done", async () => {
    const docs  = await outDir();
    const cache = path.join(await outDir(), "cache.json");

    await monorepoRun({
      provider  : createFakeProvider(),
      outDir    : docs,
      cachePath : cache,
      reviewPlan: async () => ["packages/api"],
    });

    const provider = createFakeProvider();
    let second: PlanReview | undefined;

    await monorepoRun({
      provider,
      outDir    : docs,
      cachePath : cache,
      reviewPlan: async (review) => {
        second = review;
        return ["packages/web"];
      },
    });

    // The project generated a moment ago comes back with nothing left to do,
    // which is what the picker shows as done.
    expect(second?.projects.find((one) => one.id === "packages/api")?.pending).toBe(0);
    expect(second?.projects.find((one) => one.id === "packages/web")?.pending).toBeGreaterThan(0);

    expect([...new Set(provider.calls.map((call) => String(call.metadata.projectId)))]).toEqual([
      "packages/web",
    ]);
  });

  it("sends nothing at all when the review keeps no project", async () => {
    const provider = createFakeProvider();

    const result = await monorepoRun({
      provider,
      outDir    : await outDir(),
      cachePath : path.join(await outDir(), "cache.json"),
      reviewPlan: async () => [],
    });

    expect(provider.calls).toEqual([]);
    expect(result.generated).toBe(0);
    expect(result.plan).toEqual([]);
  });

  it("never asks the review on a dry run, which was never going to send anything", async () => {
    let asked = false;

    const result = await monorepoRun({
      provider  : createFakeProvider(),
      outDir    : await outDir(),
      cachePath : path.join(await outDir(), "cache.json"),
      reviewPlan: async () => {
        asked = true;
        return [];
      },
      ...{ dryRun: true },
    });

    expect(asked).toBe(false);
    expect(result.plan.length).toBeGreaterThan(0);
  });
});
