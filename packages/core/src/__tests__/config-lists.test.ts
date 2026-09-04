import { DEFAULT_EXCLUDE, DEFAULT_EXCLUDE_FROM_CONTENT, DEFAULT_IGNORE_UNITS } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import { resolveConfig } from "../config-resolve.js";

const project = (values: Record<string, unknown>) =>
  resolveConfig({ project: values as never });

describe("the additive lists", () => {
  it("keeps every default when a config adds one pattern", () => {
    const { config } = project({ exclude: ["**/legacy/**"] });

    expect(config.exclude).toHaveLength(DEFAULT_EXCLUDE.length + 1);

    for (const pattern of DEFAULT_EXCLUDE) {
      expect(config.exclude).toContain(pattern);
    }

    expect(config.exclude.at(-1)).toBe("**/legacy/**");
  });

  it("drops the one default a `-` entry names, and nothing else", () => {
    const { config } = project({ excludeFromContent: ["-**/tests/**"] });

    expect(config.excludeFromContent).not.toContain("**/tests/**");
    expect(config.excludeFromContent).toHaveLength(DEFAULT_EXCLUDE_FROM_CONTENT.length - 1);
    expect(config.excludeFromContent).toContain("**/__tests__/**");
  });

  it("subtracts and adds in the same list", () => {
    const { config, lists } = project({
      ignoreUnits: ["-**/mocks/**", "**/legacy/**", "-**/benches/**"],
    });

    expect(config.ignoreUnits).not.toContain("**/mocks/**");
    expect(config.ignoreUnits).not.toContain("**/benches/**");
    expect(config.ignoreUnits).toContain("**/legacy/**");
    expect(config.ignoreUnits).toHaveLength(DEFAULT_IGNORE_UNITS.length - 1);

    expect(lists.ignoreUnits.removed).toEqual(["**/mocks/**", "**/benches/**"]);
    expect(lists.ignoreUnits.added).toEqual(["**/legacy/**"]);
  });

  it("reports a removal that matches no default", () => {
    const { config, lists } = project({ exclude: ["-**/typo/**"] });

    expect(lists.exclude.unmatched).toEqual(["**/typo/**"]);
    expect(config.exclude).toEqual([...DEFAULT_EXCLUDE]);
  });

  it("reports nothing when every removal lands", () => {
    const { lists } = project({ exclude: ["-**/out/**"] });

    expect(lists.exclude.unmatched).toEqual([]);
    expect(lists.exclude.removed).toEqual(["**/out/**"]);
  });

  it("leaves adapters and include on replace semantics", () => {
    const { config } = project({ adapters: ["generic"], include: ["src/**"] });

    expect(config.adapters).toEqual(["generic"]);
    expect(config.include).toEqual(["src/**"]);
  });

  it("still records the source that set an additive list", () => {
    const { origins } = project({ exclude: ["**/legacy/**"] });

    expect(origins.exclude).toBe("project");
    expect(origins.ignoreUnits).toBe("default");
  });

  it("resolves the defaults when no source sets anything", () => {
    const { config, lists } = resolveConfig();

    expect(config.exclude).toEqual([...DEFAULT_EXCLUDE]);
    expect(lists.exclude.added).toEqual([]);
    expect(lists.exclude.removed).toEqual([]);
    expect(lists.exclude.unmatched).toEqual([]);
  });
});
