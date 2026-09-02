import { fileURLToPath } from "node:url";
import { scan } from "@glossic/core";
import type { Manifest } from "@glossic/schema";
import { GlossicConfigSchema } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import { builtinAdapters } from "../../registries.js";
import { renderScanReport } from "../../render/index.js";

const GENERATED_AT = "2026-01-01T00:00:00.000Z";

const exampleDir = (name: string): string =>
  fileURLToPath(new URL(`../../../../../examples/${name}`, import.meta.url));

/**
 * The fixtures are small enough that the default subtree merge collapses each
 * one into a single unit; these tests are about per-directory units.
 */
const TREE_CONFIG = GlossicConfigSchema.parse({ mergeChildrenInto: 1 });

const scanExample = (name: string) =>
  scan({
    root       : exampleDir(name),
    adapters   : builtinAdapters,
    config     : TREE_CONFIG,
    generatedAt: GENERATED_AT,
  });

/** Absolute paths are machine-specific; everything else must be stable. */
const portable = (manifest: Manifest): Manifest => ({
  ...manifest,
  workspace: { ...manifest.workspace, root: "<root>" },
});

describe("glossic scan", () => {
  it("uses the generic adapter for every project", async () => {
    const result = await scanExample("monorepo");

    expect(result.adapterByProject).toEqual({
      "packages/api": "generic",
      "packages/web": "generic",
    });
  });

  it("keeps units of a monorepo scoped to their project", async () => {
    const { manifest } = await scanExample("monorepo");

    expect(manifest.workspace.isMonorepo).toBe(true);
    expect(manifest.units.map((unit) => unit.id)).toEqual([
      "packages/api:src",
      "packages/api:src/routes",
      "packages/api:src/services",
      "packages/web:src",
      "packages/web:src/components",
      "packages/web:src/hooks",
    ]);
    expect(
      manifest.units.find((unit) => unit.id === "packages/web:src")?.facts.base.languages,
    ).toEqual([{ language: "tsx", count: 1 }]);
  });

  it("produces an identical manifest on two consecutive runs", async () => {
    const first  = await scanExample("nestjs-api");
    const second = await scanExample("nestjs-api");

    expect(JSON.stringify(portable(second.manifest))).toBe(
      JSON.stringify(portable(first.manifest)),
    );
  });

  it("matches the nestjs-api manifest snapshot", async () => {
    const { manifest } = await scanExample("nestjs-api");

    expect(portable(manifest)).toMatchSnapshot();
  });

  it("renders a deterministic report", async () => {
    const result = await scanExample("monorepo");

    expect(renderScanReport(result)).toBe(renderScanReport(result));
    expect(renderScanReport(result)).toMatchSnapshot();
  });
});
