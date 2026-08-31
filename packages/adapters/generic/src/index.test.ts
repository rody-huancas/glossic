import { AdapterSchema } from "@glosik/schema";
import { describe, expect, it } from "vitest";
import { genericAdapter, genericAdapterName } from "./index.js";

describe("generic adapter", () => {
  it('is named "generic"', () => {
    expect(genericAdapter.name).toBe(genericAdapterName);
  });

  it("satisfies the Adapter schema", () => {
    expect(() => AdapterSchema.parse(genericAdapter)).not.toThrow();
  });
});
