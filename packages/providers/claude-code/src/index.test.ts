import { ProviderSchema } from "@glosik/schema";
import { describe, expect, it } from "vitest";
import { claudeCodeProvider, claudeCodeProviderName } from "./index.js";

describe("claude-code provider", () => {
  it('is named "claude-code"', () => {
    expect(claudeCodeProvider.name).toBe(claudeCodeProviderName);
  });

  it("satisfies the Provider schema", () => {
    expect(() => ProviderSchema.parse(claudeCodeProvider)).not.toThrow();
  });

  it("is unavailable in the scaffold", async () => {
    await expect(claudeCodeProvider.available()).resolves.toBe(false);
  });
});
