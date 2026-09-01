import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Adapter, DiscoverContext, DiscoveredUnit, ExtractContext } from "@glossic/schema";
import { GlossicConfigSchema, ProviderError } from "@glossic/schema";
import { afterAll, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { generate } from "./generate.js";
import { exampleDir } from "./test-utils.js";
import { createFakeProvider } from "./testing.js";

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
  name: "fake",
  detect: async (): Promise<boolean> => true,
  discover: async (ctx: DiscoverContext): Promise<DiscoveredUnit[]> => [
    {
      id: `${ctx.project.id}:src/config`,
      projectId: ctx.project.id,
      name: "src/config",
      path: "src/config",
      files: ["src/config/app.config.ts"],
      testFiles: [],
      ignoredFiles: [],
    },
    {
      id: `${ctx.project.id}:src/users/dto`,
      projectId: ctx.project.id,
      name: "src/users/dto",
      path: "src/users/dto",
      files: ["src/users/dto/create-user.dto.ts"],
      testFiles: [],
      ignoredFiles: [],
    },
  ],
  extract: async (ctx: ExtractContext) => ({
    units: ctx.units.map((discovered) => ({
      id: discovered.id,
      projectId: discovered.projectId,
      kind: "directory" as const,
      name: discovered.name,
      path: discovered.path,
      facts: {
        base: {
          files: discovered.files.map((file) => ({
            path: file,
            language: "typescript",
            bytes: 1,
          })),
          testFiles: [],
          ignoredFiles: [],
          languages: [{ language: "typescript", count: discovered.files.length }],
          roleHint: discovered.name.endsWith("dto") ? ("dtos" as const) : ("config" as const),
        },
        producedBy: ["fake"],
      },
      hash: `hash-${discovered.name}`,
    })),
    relations: [],
  }),
};

/** The adapter has to be named in the config, or it is never tried. */
const FAKE_CONFIG = GlossicConfigSchema.parse({ adapters: ["fake"] });

const run = async (overrides: Partial<Parameters<typeof generate>[0]> = {}) =>
  generate({
    root: exampleDir("nestjs-api"),
    adapters: [fakeAdapter],
    config: FAKE_CONFIG,
    outDir: await outDir(),
    // Never the fixture's own .glossic: tests must not leave state in the repo.
    cachePath: path.join(await outDir(), "cache.json"),
    generatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });

describe("generate --dry-run", () => {
  it("never calls the provider", async () => {
    const provider = createFakeProvider();
    const result = await run({ provider, dryRun: true });

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
    const docs = await outDir();
    const result = await run({ provider: createFakeProvider(), outDir: docs });

    expect(result.written).toEqual(["index.md", "src/config.md", "src/users/dto.md"]);

    const doc = await fs.readFile(path.join(docs, "src/users/dto.md"), "utf8");
    const match = /^---\n([\s\S]*?)\n---\n/.exec(doc);
    expect(match).not.toBeNull();
    expect(parseYaml(match?.[1] ?? "")).toEqual({
      title: "src/users/dto",
      unit: "root:src/users/dto",
      project: "root",
      path: "src/users/dto",
      role: "dtos",
      hash: "hash-src/users/dto",
      files: 1,
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
            code: "api",
            message: "rate limited",
          });
        }
        return OK_DOCUMENT;
      },
    });

    const docs = await outDir();
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
    let peak = 0;

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
