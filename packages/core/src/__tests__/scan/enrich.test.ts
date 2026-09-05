import type { EnrichResult, ExtractResult, SymbolFact, Unit } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import { applyEnrichment } from "../../scan/enrich.js";

const unit = (id: string): Unit => ({
  id,
  projectId: "root",
  kind     : "directory",
  name     : id,
  path     : id,
  facts    : {
    base: {
      files       : [{ path: `${id}/index.ts`, language: "typescript", bytes: 10 }],
      testFiles   : [],
      ignoredFiles: [],
      languages   : [{ language: "typescript", count: 1 }],
      roleHint    : null,
    },
    producedBy: ["generic"],
  },
  hash: `hash-${id}`,
});

const symbol = (name: string, file: string, line: number): SymbolFact => ({
  name,
  kind    : "function",
  file,
  exported: true,
  line,
});

const extracted = (...units: Unit[]): ExtractResult => ({ units, relations: [] });

const enrichment = (facts: EnrichResult["facts"], relations: EnrichResult["relations"] = []): EnrichResult => ({
  facts,
  relations,
});

describe("applyEnrichment", () => {
  it("leaves a unit the pass said nothing about byte for byte alone", () => {
    const before = extracted(unit("src/a"), unit("src/b"));
    const after  = applyEnrichment(before, "treesitter", enrichment({}));

    expect(after.units).toEqual(before.units);
  });

  it("leaves a unit alone when the pass hands back an empty enrichment", () => {
    const before = extracted(unit("src/a"));
    const after  = applyEnrichment(before, "treesitter", enrichment({ "src/a": {} }));

    expect(after.units[0]).toEqual(before.units[0]);
  });

  it("adds symbols and records the pass in producedBy", () => {
    const before = extracted(unit("src/a"));
    const after  = applyEnrichment(
      before,
      "treesitter",
      enrichment({ "src/a": { symbols: { symbols: [symbol("run", "src/a/index.ts", 3)] } } }),
    );

    expect(after.units[0]?.facts.symbols?.symbols).toHaveLength(1);
    expect(after.units[0]?.facts.producedBy).toEqual(["generic", "treesitter"]);
  });

  it("never touches the base facts or the hash", () => {
    const before = extracted(unit("src/a"));
    const after  = applyEnrichment(
      before,
      "treesitter",
      enrichment({ "src/a": { symbols: { symbols: [symbol("run", "src/a/index.ts", 3)] } } }),
    );

    expect(after.units[0]?.facts.base).toEqual(before.units[0]?.facts.base);
    expect(after.units[0]?.hash).toBe(before.units[0]?.hash);
  });

  it("accumulates the symbols of two passes into one sorted list", () => {
    const first = applyEnrichment(
      extracted(unit("src/a")),
      "one",
      enrichment({ "src/a": { symbols: { symbols: [symbol("zeta", "src/a/z.ts", 1)] } } }),
    );

    const second = applyEnrichment(
      first,
      "two",
      enrichment({ "src/a": { symbols: { symbols: [symbol("alpha", "src/a/a.ts", 9)] } } }),
    );

    expect(second.units[0]?.facts.symbols?.symbols.map((one) => one.name)).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(second.units[0]?.facts.producedBy).toEqual(["generic", "one", "two"]);
  });

  it("lets a later pass replace the framework block", () => {
    const first = applyEnrichment(
      extracted(unit("src/a")),
      "one",
      enrichment({
        "src/a": { framework: { name: "express", routes: [], dependencies: [] } },
      }),
    );

    const second = applyEnrichment(
      first,
      "two",
      enrichment({ "src/a": { framework: { name: "nestjs", routes: [], dependencies: [] } } }),
    );

    expect(second.units[0]?.facts.framework?.name).toBe("nestjs");
  });

  it("keeps a relation between two units it knows", () => {
    const after = applyEnrichment(
      extracted(unit("src/a"), unit("src/b")),
      "treesitter",
      enrichment({}, [{ from: "src/a", to: "src/b", kind: "imports" }]),
    );

    expect(after.relations).toEqual([{ from: "src/a", to: "src/b", kind: "imports" }]);
  });

  it("drops a relation naming a unit that is not there", () => {
    const after = applyEnrichment(
      extracted(unit("src/a")),
      "treesitter",
      enrichment({}, [{ from: "src/a", to: "node_modules/react", kind: "imports" }]),
    );

    expect(after.relations).toEqual([]);
  });

  it("ignores an enrichment keyed by a unit id nobody built", () => {
    const before = extracted(unit("src/a"));
    const after  = applyEnrichment(
      before,
      "treesitter",
      enrichment({ "src/ghost": { symbols: { symbols: [symbol("x", "src/ghost/i.ts", 1)] } } }),
    );

    expect(after.units).toEqual(before.units);
  });
});
