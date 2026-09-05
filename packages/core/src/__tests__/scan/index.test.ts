import type { Adapter, DiscoverContext, DiscoveredUnit, EnrichContext, Enricher, ExtractContext, Layer, Manifest } from "@glossic/schema";
import { GlossicConfigSchema } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import { scan } from "../../scan/index.js";
import { exampleDir } from "../../test-utils.js";

const GENERATED_AT = "2026-01-01T00:00:00.000Z";

/** Two fixed units per project: this drives the pipeline, not a directory walk. */
const base: Adapter = {
  name  : "base",
  detect: async (): Promise<boolean> => true,
  discover: async (ctx: DiscoverContext): Promise<DiscoveredUnit[]> =>
    ["one", "two"].map((name) => ({
      id          : `${ctx.project.id}:src/${name}`,
      projectId   : ctx.project.id,
      name        : `src/${name}`,
      path        : `src/${name}`,
      files       : [`src/${name}/index.ts`],
      testFiles   : [],
      ignoredFiles: [],
    })),
  extract: async (ctx: ExtractContext) => ({
    units: ctx.units.map((discovered) => ({
      id       : discovered.id,
      projectId: discovered.projectId,
      kind     : "directory" as const,
      name     : discovered.name,
      path     : discovered.path,
      facts    : {
        base: {
          files       : discovered.files.map((file) => ({ path: file, language: "typescript", bytes: 1 })),
          testFiles   : [],
          ignoredFiles: [],
          languages   : [{ language: "typescript", count: 1 }],
          roleHint    : null,
        },
        producedBy: ["base"],
      },
      hash: `hash-${discovered.id}`,
    })),
    relations: [],
  }),
};

/** Names one exported symbol per unit and an edge between the two of them. */
const symbols: Enricher = {
  name  : "symbols",
  detect: async (): Promise<boolean> => true,
  enrich: async (ctx: EnrichContext) => ({
    facts: Object.fromEntries(
      ctx.units.map((unit) => [
        unit.id,
        {
          symbols: {
            symbols: [
              {
                name    : unit.name.endsWith("one") ? "createOne" : "createTwo",
                kind    : "function" as const,
                file    : `${unit.name}/index.ts`,
                exported: true,
                line    : 1,
              },
            ],
          },
        },
      ]),
    ),
    relations: [
      {
        from: `${ctx.project.id}:src/one`,
        to  : `${ctx.project.id}:src/two`,
        kind: "imports" as const,
      },
      { from: `${ctx.project.id}:src/one`, to: "nowhere", kind: "imports" as const },
    ],
  }),
};

const quiet: Enricher = {
  name  : "quiet",
  detect: async (): Promise<boolean> => true,
  enrich: async () => ({ facts: {}, relations: [] }),
};

const run = (layers: Layer[], wanted: string[]) =>
  scan({
    root       : exampleDir("nestjs-api"),
    adapters   : layers,
    config     : GlossicConfigSchema.parse({ adapters: wanted }),
    generatedAt: GENERATED_AT,
  });

const portable = (manifest: Manifest): Manifest => ({
  ...manifest,
  workspace: { ...manifest.workspace, root: "<root>" },
});

describe("scan", () => {
  it("reports no enricher when the chain is all adapters", async () => {
    const result = await run([base], ["base"]);

    expect(result.adapterByProject).toEqual({ root: "base" });
    expect(result.enrichersByProject).toEqual({ root: [] });
    expect(result.manifest.units.every((unit) => unit.facts.symbols === undefined)).toBe(true);
  });

  it("runs every enricher the chain names, in order", async () => {
    const result = await run([base, symbols, quiet], ["base", "symbols", "quiet"]);

    expect(result.enrichersByProject).toEqual({ root: ["symbols", "quiet"] });
  });

  it("skips an enricher the config leaves out", async () => {
    const result = await run([base, symbols], ["base"]);

    expect(result.enrichersByProject).toEqual({ root: [] });
    expect(result.manifest.units[0]?.facts.symbols).toBeUndefined();
  });

  it("adds facts without moving a single unit id or hash", async () => {
    const plain    = await run([base], ["base"]);
    const enriched = await run([base, symbols], ["base", "symbols"]);

    expect(enriched.manifest.units.map((unit) => unit.id)).toEqual(
      plain.manifest.units.map((unit) => unit.id),
    );
    expect(enriched.manifest.units.map((unit) => unit.hash)).toEqual(
      plain.manifest.units.map((unit) => unit.hash),
    );
    expect(enriched.manifest.units.map((unit) => unit.facts.base)).toEqual(
      plain.manifest.units.map((unit) => unit.facts.base),
    );
  });

  it("records the enricher in producedBy and its symbols in the unit", async () => {
    const { manifest } = await run([base, symbols], ["base", "symbols"]);
    const unit         = manifest.units.find((one) => one.name === "src/one");

    expect(unit?.facts.producedBy).toEqual(["base", "symbols"]);
    expect(unit?.facts.symbols?.symbols.map((one) => one.name)).toEqual(["createOne"]);
  });

  it("keeps the enricher relations it can resolve and drops the rest", async () => {
    const { manifest } = await run([base, symbols], ["base", "symbols"]);

    expect(manifest.relations).toEqual([
      { from: "root:src/one", to: "root:src/two", kind: "imports" },
    ]);
  });

  it("produces an identical manifest on two consecutive enriched runs", async () => {
    const first  = await run([base, symbols], ["base", "symbols"]);
    const second = await run([base, symbols], ["base", "symbols"]);

    expect(JSON.stringify(portable(second.manifest))).toBe(
      JSON.stringify(portable(first.manifest)),
    );
  });
});
