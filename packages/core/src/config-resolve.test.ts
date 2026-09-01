import { GlossicConfigSchema } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import { resolveConfig } from "./config-resolve.js";

describe("resolveConfig", () => {
  it("falls back to the schema defaults with no sources at all", () => {
    const { config, origins } = resolveConfig();

    expect(config).toEqual(GlossicConfigSchema.parse({}));
    expect(new Set(Object.values(origins))).toEqual(new Set(["default"]));
  });

  it("walks the chain for every option, not just lang", () => {
    const { config, origins } = resolveConfig({
      flags: { lang: "fr", concurrency: 9 },
      project: { lang: "de", maxUnitFiles: 4, adapters: ["generic"] },
      preference: { lang: "it", concurrency: 2, minUnitFiles: 7 },
    });

    expect(config.lang).toBe("fr");
    expect(origins.lang).toBe("flag");

    expect(config.concurrency).toBe(9);
    expect(origins.concurrency).toBe("flag");

    expect(config.maxUnitFiles).toBe(4);
    expect(origins.maxUnitFiles).toBe("project");

    expect(config.adapters).toEqual(["generic"]);
    expect(origins.adapters).toBe("project");

    expect(config.minUnitFiles).toBe(7);
    expect(origins.minUnitFiles).toBe("preference");

    expect(config.mergeChildrenInto).toBe(25);
    expect(origins.mergeChildrenInto).toBe("default");
  });

  it("lets the project outrank the preference and the flag outrank both", () => {
    const sources = { flags: { model: "a" }, project: { model: "b" }, preference: { model: "c" } };

    expect(resolveConfig(sources).config.model).toBe("a");
    expect(resolveConfig({ ...sources, flags: undefined }).config.model).toBe("b");
    expect(resolveConfig({ ...sources, flags: undefined, project: undefined }).config.model).toBe(
      "c",
    );
  });

  it("does not let a partial source inject defaults over a lower one", () => {
    // A config file that only names adapters must not also be dictating the
    // language: the value it never declared has to come from the preference.
    const { config, origins } = resolveConfig({
      project: { adapters: ["generic"] },
      preference: { lang: "pt" },
    });

    expect(config.lang).toBe("pt");
    expect(origins.lang).toBe("preference");
    expect(origins.adapters).toBe("project");
  });

  it("treats a blank string as nothing said", () => {
    const { config, origins } = resolveConfig({
      flags: { provider: "   " },
      project: { provider: "anthropic" },
    });

    expect(config.provider).toBe("anthropic");
    expect(origins.provider).toBe("project");
  });

  it("reports an origin for every key of the resolved config", () => {
    const { config, origins } = resolveConfig({ flags: { lang: "es" } });

    for (const key of Object.keys(config)) {
      expect(origins[key]).toBeDefined();
    }
  });

  it("still validates: an impossible value is rejected", () => {
    expect(() => resolveConfig({ project: { concurrency: -1 } })).toThrow();
  });
});
