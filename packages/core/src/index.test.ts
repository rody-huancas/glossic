import { describe, expect, it } from "vitest";

import manifest from "../package.json" with { type: "json" };
import { CORE_VERSION, createAdapterRegistry, NotImplementedError } from "./index.js";

describe("@glossic/core", () => {
  it("exposes the version from its own manifest", () => {
    expect(CORE_VERSION).toBe(manifest.version);
    expect(CORE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("registers adapters by name", () => {
    const registry = createAdapterRegistry();
    expect(registry.size).toBe(0);
    expect(registry.get("nope")).toBeUndefined();
  });

  it("NotImplementedError carries the stub name", () => {
    expect(new NotImplementedError("generate").message).toBe("generate is not implemented");
  });
});
