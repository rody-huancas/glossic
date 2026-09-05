import type { Adapter, DiscoverContext, Enricher, Layer } from "@glossic/schema";
import { GlossicConfigSchema } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import { orderAdapters, selectAdapter, selectEnrichers } from "../../scan/layers.js";

const CONTEXT: DiscoverContext = {
  root     : "/repo",
  config   : GlossicConfigSchema.parse({}),
  project  : { id: "root", name: "repo", rootDir: "." },
  workspace: {
    name      : "repo",
    root      : "/repo",
    isMonorepo: false,
    tool      : "none",
    projects  : [{ id: "root", name: "repo", rootDir: "." }],
  },
};

const adapter = (name: string, detects: boolean): Adapter => ({
  name,
  detect  : async (): Promise<boolean> => detects,
  discover: async () => [],
  extract : async () => ({ units: [], relations: [] }),
});

const enricher = (name: string, detects: boolean): Enricher => ({
  name,
  detect: async (): Promise<boolean> => detects,
  enrich: async () => ({ facts: {}, relations: [] }),
});

describe("orderAdapters", () => {
  it("follows the config order and drops what it omits", () => {
    const layers: Layer[] = [adapter("a", true), enricher("b", true), adapter("c", true)];

    expect(orderAdapters(layers, ["c", "b"]).map((layer) => layer.name)).toEqual(["c", "b"]);
  });

  it("ignores a name no layer answers to", () => {
    expect(orderAdapters([adapter("a", true)], ["ghost", "a"]).map((l) => l.name)).toEqual(["a"]);
  });
});

describe("selectAdapter", () => {
  it("takes the first base adapter that detects", async () => {
    const layers: Layer[] = [adapter("no", false), adapter("yes", true), adapter("later", true)];

    await expect(selectAdapter(layers, CONTEXT)).resolves.toMatchObject({ name: "yes" });
  });

  it("never takes an enricher, whatever it detects", async () => {
    const layers: Layer[] = [enricher("first", true), adapter("base", true)];

    await expect(selectAdapter(layers, CONTEXT)).resolves.toMatchObject({ name: "base" });
  });

  it("resolves to undefined when nothing claims the project", async () => {
    await expect(selectAdapter([adapter("no", false)], CONTEXT)).resolves.toBeUndefined();
  });
});

describe("selectEnrichers", () => {
  it("takes every enricher that detects, in chain order", async () => {
    const layers: Layer[] = [
      enricher("second", true),
      adapter("base", true),
      enricher("skipped", false),
      enricher("third", true),
    ];

    const claimed = await selectEnrichers(layers, CONTEXT);

    expect(claimed.map((one) => one.name)).toEqual(["second", "third"]);
  });

  it("resolves to an empty list when the chain is all adapters", async () => {
    await expect(selectEnrichers([adapter("base", true)], CONTEXT)).resolves.toEqual([]);
  });
});
