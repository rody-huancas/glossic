import { AdapterSchema } from "@glosik/schema";
import { describe, expect, it } from "vitest";
import { nestjsAdapter, nestjsAdapterName } from "./index.js";

describe("nestjs adapter", () => {
  it('is named "nestjs"', () => {
    expect(nestjsAdapter.name).toBe(nestjsAdapterName);
  });

  it("satisfies the Adapter schema", () => {
    expect(() => AdapterSchema.parse(nestjsAdapter)).not.toThrow();
  });
});
