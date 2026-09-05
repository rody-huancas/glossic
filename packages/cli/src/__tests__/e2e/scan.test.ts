import { fileURLToPath } from "node:url";
import { scan } from "@glossic/core";
import type { EnrichContext, Enricher, Manifest } from "@glossic/schema";
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

  it("runs the treesitter enricher over a TypeScript project", async () => {
    const result = await scanExample("monorepo");

    expect(result.enrichersByProject).toEqual({
      "packages/api": ["treesitter"],
      "packages/web": ["treesitter"],
    });
  });

  it("runs no enricher over a project no grammar reads", async () => {
    const result = await scanExample("go-api");

    expect(result.enrichersByProject).toEqual({ root: [] });
    expect(result.manifest.units.every((unit) => unit.facts.symbols === undefined)).toBe(true);
  });

  it("names the exported surface of a unit and who found it", async () => {
    const { manifest } = await scanExample("nestjs-api");
    const users        = manifest.units.find((unit) => unit.id === "root:src/users");

    expect(users?.facts.producedBy).toEqual(["generic", "treesitter"]);
    expect(users?.facts.symbols?.symbols.map((one) => one.name)).toContain("UsersService");
    expect(users?.facts.symbols?.symbols.every((one) => one.exported)).toBe(true);
  });

  it("draws an edge between two units one of them imports", async () => {
    const { manifest } = await scanExample("nestjs-api");

    expect(manifest.relations).toContainEqual({
      from  : "root:src/users",
      to    : "root:src/users/entities",
      kind  : "imports",
      weight: 2,
    });
  });
});


/** Claims every project and names one symbol per unit, so a real chain has two layers. */
const stamp: Enricher = {
  name  : "stamp",
  detect: async (): Promise<boolean> => true,
  enrich: async (ctx: EnrichContext) => ({
    facts: Object.fromEntries(
      ctx.units.map((unit) => [
        unit.id,
        {
          symbols: {
            symbols: [
              {
                name    : "stamped",
                kind    : "function" as const,
                file    : unit.facts.base.files[0]?.path ?? unit.path,
                exported: true,
              },
            ],
          },
        },
      ]),
    ),
    relations: [],
  }),
};

describe("glossic scan with an enricher on the chain", () => {
  const withStamp = (name: string) =>
    scan({
      root       : exampleDir(name),
      adapters   : [...builtinAdapters, stamp],
      config     : GlossicConfigSchema.parse({
        mergeChildrenInto: 1,
        adapters         : ["nestjs", "treesitter", "generic", "stamp"],
      }),
      generatedAt: GENERATED_AT,
    });

  it("keeps the generic adapter as the base of every project", async () => {
    const result = await withStamp("monorepo");

    expect(result.adapterByProject).toEqual({
      "packages/api": "generic",
      "packages/web": "generic",
    });
    expect(result.enrichersByProject).toEqual({
      "packages/api": ["treesitter", "stamp"],
      "packages/web": ["treesitter", "stamp"],
    });
  });

  it("adds symbols without moving a unit id, a hash or a base fact", async () => {
    const plain   = await scanExample("nestjs-api");
    const stamped = await withStamp("nestjs-api");

    expect(stamped.manifest.units.map((unit) => unit.id)).toEqual(
      plain.manifest.units.map((unit) => unit.id),
    );
    expect(stamped.manifest.units.map((unit) => unit.hash)).toEqual(
      plain.manifest.units.map((unit) => unit.hash),
    );
    expect(stamped.manifest.units.map((unit) => unit.facts.base)).toEqual(
      plain.manifest.units.map((unit) => unit.facts.base),
    );
    expect(stamped.manifest.units.every((unit) => unit.facts.symbols !== undefined)).toBe(true);
    expect(stamped.manifest.units[0]?.facts.producedBy).toEqual([
      "generic",
      "stamp",
      "treesitter",
    ]);
  });
});
