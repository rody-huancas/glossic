import { describe, expect, it } from "vitest";

import { CORE_VERSION, createAdapterRegistry, NotImplementedError } from "./index.js";

describe("@glosik/core", () => {
  it("exposes a version", () => {
    expect(CORE_VERSION).toBe("0.0.0");
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
