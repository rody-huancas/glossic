import { ProviderSchema } from "@glosik/schema";
import { describe, expect, it } from "vitest";
import { anthropicProvider, anthropicProviderName } from "./index.js";

describe("anthropic provider", () => {
  it('is named "anthropic"', () => {
    expect(anthropicProvider.name).toBe(anthropicProviderName);
  });

  it("satisfies the Provider schema", () => {
    expect(() => ProviderSchema.parse(anthropicProvider)).not.toThrow();
  });

  it("is unavailable in the scaffold", async () => {
    await expect(anthropicProvider.available()).resolves.toBe(false);
  });
});
