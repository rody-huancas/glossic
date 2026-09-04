import { describe, expect, it } from "vitest";

import { applyListOverride } from "../../config/lists.js";

const DEFAULTS = ["**/dist/**", "**/obj/**", "**/out/**"] as const;

describe("applyListOverride", () => {
  it("keeps the default when the config says nothing", () => {
    expect(applyListOverride(DEFAULTS, undefined)).toEqual({
      value    : ["**/dist/**", "**/obj/**", "**/out/**"],
      added    : [],
      removed  : [],
      unmatched: [],
    });
  });

  it("appends a bare pattern after the default", () => {
    expect(applyListOverride(DEFAULTS, ["**/legacy/**"])).toEqual({
      value    : ["**/dist/**", "**/obj/**", "**/out/**", "**/legacy/**"],
      added    : ["**/legacy/**"],
      removed  : [],
      unmatched: [],
    });
  });

  it("drops the default a `-` names", () => {
    expect(applyListOverride(DEFAULTS, ["-**/out/**"])).toEqual({
      value    : ["**/dist/**", "**/obj/**"],
      added    : [],
      removed  : ["**/out/**"],
      unmatched: [],
    });
  });

  it("reports a removal that matches no default", () => {
    const override = applyListOverride(DEFAULTS, ["-**/nope/**"]);

    expect(override.unmatched).toEqual(["**/nope/**"]);
    expect(override.removed).toEqual([]);
    expect(override.value).toEqual(["**/dist/**", "**/obj/**", "**/out/**"]);
  });

  it("adds a pattern that is already a default only once", () => {
    const override = applyListOverride(DEFAULTS, ["**/obj/**"]);

    expect(override.value).toEqual(["**/dist/**", "**/obj/**", "**/out/**"]);
    expect(override.added).toEqual([]);
  });

  it("escapes a pattern that really starts with a dash", () => {
    const override = applyListOverride(DEFAULTS, ["\\-weird/**"]);

    expect(override.added).toEqual(["-weird/**"]);
    expect(override.removed).toEqual([]);
    expect(override.unmatched).toEqual([]);
  });

  it("resolves to the same order however the entries are written", () => {
    const one = applyListOverride(DEFAULTS, ["-**/obj/**", "a/**", "b/**"]);
    const two = applyListOverride(DEFAULTS, ["a/**", "-**/obj/**", "b/**"]);

    expect(one.value).toEqual(["**/dist/**", "**/out/**", "a/**", "b/**"]);
    expect(two.value).toEqual(one.value);
  });
});
