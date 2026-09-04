import { resolveConfig } from "@glossic/core";
import type { GlossicUserConfig } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import { createTranslator } from "../../i18n/index.js";
import { renderUnmatchedRemovals } from "../../render/config.js";

const warn = (values: GlossicUserConfig, uiLang: "en" | "es" = "en"): string =>
  renderUnmatchedRemovals(resolveConfig({ project: values }).lists, createTranslator(uiLang));

describe("renderUnmatchedRemovals", () => {
  it("says nothing when no list was touched", () => {
    expect(warn({})).toBe("");
  });

  it("says nothing when every removal matched a default", () => {
    expect(warn({ exclude: ["-**/out/**", "**/legacy/**"] })).toBe("");
  });

  it("names the list and the pattern that removed nothing", () => {
    const output = warn({ exclude: ["-**/typo/**"] });

    expect(output).toContain("exclude");
    expect(output).toContain("**/typo/**");
    expect(output.trimEnd().split("\n")).toHaveLength(1);
  });

  it("counts several unmatched removals in one list", () => {
    const output = warn({ ignoreUnits: ["-**/a/**", "-**/b/**"] });

    expect(output).toContain("2");
    expect(output).toContain("**/a/**, **/b/**");
  });

  it("reports one line per list", () => {
    const output = warn({
      exclude           : ["-**/typo/**"],
      excludeFromContent: ["-**/nope/**"],
    });

    expect(output.trimEnd().split("\n")).toHaveLength(2);
  });

  it("warns in the language of the interface", () => {
    expect(warn({ exclude: ["-**/typo/**"] }, "es")).toContain("no quita nada");
  });
});
