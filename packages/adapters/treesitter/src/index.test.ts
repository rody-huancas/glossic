import { AdapterSchema } from "@glosik/schema";
import { describe, expect, it } from "vitest";
import { treesitterAdapter, treesitterAdapterName } from "./index.js";

describe("treesitter adapter", () => {
  it('is named "treesitter"', () => {
    expect(treesitterAdapter.name).toBe(treesitterAdapterName);
  });

  it("satisfies the Adapter schema", () => {
    expect(() => AdapterSchema.parse(treesitterAdapter)).not.toThrow();
  });
});
