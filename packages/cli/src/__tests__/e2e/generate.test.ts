import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFakeProvider, generate } from "@glossic/core";
import { GlossicConfigSchema } from "@glossic/schema";
import { afterAll, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { builtinAdapters } from "../../registries.js";

const exampleDir = (name: string): string =>
  fileURLToPath(new URL(`../../../../../examples/${name}`, import.meta.url));

/**
 * The fixtures are small enough that the default subtree merge collapses each
 * one into a single unit. These tests are about how generate mirrors a tree
 * across several documents, so they turn that merge off.
 */
const TREE_CONFIG = GlossicConfigSchema.parse({ mergeChildrenInto: 1 });

const tempDirs: string[] = [];

const outDir = async (): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-cli-docs-"));
  tempDirs.push(dir);
  return dir;
};

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

describe("generate over the nestjs-api fixture", () => {
  it("mirrors the source tree and links every unit from the index", async () => {
    const docs = await outDir();
    const provider = createFakeProvider();

    const result = await generate({
      root: exampleDir("nestjs-api"),
      adapters: builtinAdapters,
      config: TREE_CONFIG,
      provider,
      outDir: docs,
      cachePath: path.join(docs, "cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.written).toEqual([
      "index.md",
      "src.md",
      "src/config.md",
      "src/users.md",
      "src/users/dto.md",
      "src/users/entities.md",
      "test.md",
    ]);

    const index = await fs.readFile(path.join(docs, "index.md"), "utf8");
    for (const doc of result.written.filter((entry) => entry !== "index.md")) {
      expect(index).toContain(`(./${doc})`);
    }

    expect(provider.calls).toHaveLength(6);
  });

  it("stamps the unit hash from the manifest into the frontmatter", async () => {
    const docs = await outDir();

    const result = await generate({
      root: exampleDir("nestjs-api"),
      adapters: builtinAdapters,
      config: TREE_CONFIG,
      provider: createFakeProvider(),
      outDir: docs,
      cachePath: path.join(docs, "cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    const unit = result.manifest.units.find((entry) => entry.name === "src/users/dto");
    const doc = await fs.readFile(path.join(docs, "src/users/dto.md"), "utf8");
    const frontmatter = parseYaml(/^---\n([\s\S]*?)\n---\n/.exec(doc)?.[1] ?? "") as {
      hash: string;
      role: string;
    };

    expect(frontmatter.hash).toBe(unit?.hash);
    expect(frontmatter.role).toBe("dtos");
  });

  it("does not touch the provider on a dry run of a monorepo", async () => {
    const provider = createFakeProvider();

    const result = await generate({
      root: exampleDir("monorepo"),
      adapters: builtinAdapters,
      config: TREE_CONFIG,
      provider,
      outDir: await outDir(),
      cachePath: path.join(await outDir(), "cache.json"),
      dryRun: true,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(provider.calls).toEqual([]);
    // Thin "src" directories absorbed their first child, so six units became four.
    expect(result.plan.map((entry) => entry.docPath)).toEqual([
      "packages/api/src.md",
      "packages/api/src/services.md",
      "packages/web/src.md",
      "packages/web/src/hooks.md",
    ]);
  });
});
