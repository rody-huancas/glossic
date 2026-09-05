import { describe, expect, it } from "vitest";

import { candidatePaths, isRelative, resolveSpecifier } from "../resolve.js";

const OWNERS = new Map([
  ["src/core/strings.ts", "root:src/core"],
  ["src/core/index.ts", "root:src/core"],
  ["src/ui/Button.tsx", "root:src/ui"],
  ["src/ui/legacy.js", "root:src/ui"],
  ["src/data/index.ts", "root:src/data"],
]);

describe("isRelative", () => {
  it("takes a specifier that walks the tree", () => {
    expect(isRelative("./a.js")).toBe(true);
    expect(isRelative("../b/c.js")).toBe(true);
  });

  it("leaves out everything that names a package", () => {
    expect(isRelative("react")).toBe(false);
    expect(isRelative("@glossic/schema")).toBe(false);
    expect(isRelative("node:path")).toBe(false);
    expect(isRelative("#internal/thing")).toBe(false);
    expect(isRelative("/absolute/path.js")).toBe(false);
  });
});

describe("candidatePaths", () => {
  it("rewrites a .js specifier to the TypeScript it names", () => {
    expect(candidatePaths("src/core/strings.js")).toEqual([
      "src/core/strings.ts",
      "src/core/strings.tsx",
      "src/core/strings.js",
      "src/core/strings.jsx",
    ]);
  });

  it("keeps .mjs and .cjs on their own halves of the split", () => {
    expect(candidatePaths("a/b.mjs")).toEqual(["a/b.mts", "a/b.mjs"]);
    expect(candidatePaths("a/b.cjs")).toEqual(["a/b.cts", "a/b.cjs"]);
  });

  it("tries the extensions and then the directory index when there is none", () => {
    const candidates = candidatePaths("src/core");

    expect(candidates[0]).toBe("src/core.ts");
    expect(candidates).toContain("src/core/index.ts");
    expect(candidates).toContain("src/core/index.tsx");
  });

  it("tries an unfamiliar extension as written before adding one", () => {
    expect(candidatePaths("src/a.ts")[0]).toBe("src/a.ts");
  });
});

describe("resolveSpecifier", () => {
  it("resolves a sibling named by its compiled extension", () => {
    expect(resolveSpecifier("src/core/index.ts", "./strings.js", OWNERS)).toBe("root:src/core");
  });

  it("resolves a specifier that walks up out of its directory", () => {
    expect(resolveSpecifier("src/ui/Button.tsx", "../core/strings.js", OWNERS)).toBe(
      "root:src/core",
    );
  });

  it("resolves a directory to the index inside it", () => {
    expect(resolveSpecifier("src/ui/Button.tsx", "../data", OWNERS)).toBe("root:src/data");
  });

  it("resolves a .tsx sibling written with a .jsx extension", () => {
    expect(resolveSpecifier("src/ui/legacy.js", "./Button.jsx", OWNERS)).toBe("root:src/ui");
  });

  it("resolves to undefined for a file no unit owns", () => {
    expect(resolveSpecifier("src/core/index.ts", "./missing.js", OWNERS)).toBeUndefined();
    expect(resolveSpecifier("src/core/index.ts", "./styles.css", OWNERS)).toBeUndefined();
  });
});
