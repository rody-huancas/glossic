import { describe, expect, it } from "vitest";

import { isFatalProviderError, isRetryableProviderError, looksLikeQuota, ProviderError } from "../errors.js";

const error = (code: ProviderError["code"]): ProviderError =>
  new ProviderError({ provider: "fake", code, message: `failed with ${code}` });

describe("looksLikeQuota", () => {
  it.each([
    "Claude AI usage limit reached|1767225600",
    "Your credit balance is too low to run this request.",
    "the organization has exceeded its monthly spend quota",
    "You are out of credits. Upgrade your plan to continue.",
  ])("reads %j as a spent quota", (text) => {
    expect(looksLikeQuota(text)).toBe(true);
  });

  it.each([
    "rate_limit_error: number of request tokens has exceeded the per-minute rate limit",
    "Overloaded",
    "claude exited with code 1",
  ])("leaves %j alone", (text) => {
    expect(looksLikeQuota(text)).toBe(false);
  });
});

describe("the two questions a caller asks about a failure", () => {
  it("retries the transient codes and not the spent quota", () => {
    expect(isRetryableProviderError(error("rate-limit"))).toBe(true);
    expect(isRetryableProviderError(error("quota"))).toBe(false);
  });

  it.each(["quota", "unauthenticated", "not-installed"] as const)(
    "calls %s fatal: no other unit of the run would get past it either",
    (code) => {
      expect(isFatalProviderError(error(code))).toBe(true);
    },
  );

  it.each(["rate-limit", "timeout", "server", "api", "invalid-output", "refused"] as const)(
    "leaves %s to the one unit that hit it",
    (code) => {
      expect(isFatalProviderError(error(code))).toBe(false);
    },
  );

  it("says no to anything that is not a provider failure at all", () => {
    expect(isFatalProviderError(new Error("not a provider error"))).toBe(false);
    expect(isFatalProviderError(undefined)).toBe(false);
  });
});
