import { describe, expect, it } from "vitest";

import { NoProviderAvailableError, UnknownProviderError } from "./errors.js";
import { probeProviders, resolveProvider } from "./provider.js";
import { createFakeProvider } from "./testing.js";

const claudeCode = (available: boolean) => createFakeProvider({ name: "claude-code", available });
const anthropic = (available: boolean) => createFakeProvider({ name: "anthropic", available });

describe("resolveProvider", () => {
  it("prefers claude-code when both are available", async () => {
    const provider = await resolveProvider({
      providers: [anthropic(true), claudeCode(true)],
    });

    expect(provider.name).toBe("claude-code");
  });

  it("falls back to anthropic when claude-code is missing", async () => {
    const provider = await resolveProvider({
      providers: [claudeCode(false), anthropic(true)],
    });

    expect(provider.name).toBe("anthropic");
  });

  it("honours an explicit request over availability", async () => {
    const provider = await resolveProvider({
      providers: [claudeCode(true), anthropic(false)],
      requested: "anthropic",
    });

    expect(provider.name).toBe("anthropic");
  });

  it("honours the configured provider", async () => {
    const provider = await resolveProvider({
      providers: [claudeCode(true), anthropic(false)],
      config: { provider: "anthropic" },
    });

    expect(provider.name).toBe("anthropic");
  });

  it("rejects an unknown provider name", async () => {
    await expect(
      resolveProvider({ providers: [claudeCode(true)], requested: "openai" }),
    ).rejects.toBeInstanceOf(UnknownProviderError);
  });

  it("explains both options when nothing is available", async () => {
    const error = await resolveProvider({
      providers: [claudeCode(false), anthropic(false)],
    }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(NoProviderAvailableError);
    expect((error as Error).message).toContain("claude.com/claude-code");
    expect((error as Error).message).toContain("ANTHROPIC_API_KEY");
    expect((error as Error).message).toContain("glosik doctor");
  });

  it("treats a throwing available() as unavailable", async () => {
    const broken = {
      name: "broken",
      available: async () => {
        throw new Error("boom");
      },
      complete: async () => {
        throw new Error("boom");
      },
    };

    const provider = await resolveProvider({ providers: [broken, anthropic(true)] });
    expect(provider.name).toBe("anthropic");
  });
});

describe("probeProviders", () => {
  it("reports every provider in preference order", async () => {
    const statuses = await probeProviders([anthropic(true), claudeCode(false)]);

    expect(statuses).toEqual([
      { name: "claude-code", available: false },
      { name: "anthropic", available: true },
    ]);
  });
});
