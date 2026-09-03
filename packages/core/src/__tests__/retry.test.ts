import { ProviderError } from "@glossic/schema";
import { describe, expect, it, vi } from "vitest";

import { backoffDelay, withRetry } from "../retry.js";

const providerError = (code: ProviderError["code"]): ProviderError =>
  new ProviderError({ provider: "fake", code, message: `failed with ${code}` });

/** Never actually waits: the delays are asserted, not slept through. */
const instantSleep = () => {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (ms: number): Promise<void> => {
      delays.push(ms);
    },
  };
};

describe("withRetry", () => {
  it("returns the first successful result without retrying", async () => {
    const task = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(task)).resolves.toBe("ok");
    expect(task).toHaveBeenCalledTimes(1);
  });

  it.each(["timeout", "rate-limit", "server"] as const)("retries a %s failure", async (code) => {
    const { sleep } = instantSleep();
    const task = vi.fn().mockRejectedValueOnce(providerError(code)).mockResolvedValue("ok");

    await expect(withRetry(task, { sleep })).resolves.toBe("ok");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it.each(["refused", "unauthenticated", "not-installed", "invalid-output", "quota", "api"] as const)(
    "never retries a %s failure",
    async (code) => {
      const { sleep, delays } = instantSleep();
      const task = vi.fn().mockRejectedValue(providerError(code));

      await expect(withRetry(task, { sleep })).rejects.toMatchObject({ code });
      expect(task).toHaveBeenCalledTimes(1);
      expect(delays).toEqual([]);
    },
  );

  it("gives up after three attempts by default", async () => {
    const { sleep, delays } = instantSleep();
    const task = vi.fn().mockRejectedValue(providerError("rate-limit"));

    await expect(withRetry(task, { sleep })).rejects.toMatchObject({ code: "rate-limit" });
    expect(task).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([500, 1000]);
  });

  it("backs off exponentially", () => {
    expect(backoffDelay(1, 500)).toBe(500);
    expect(backoffDelay(2, 500)).toBe(1000);
    expect(backoffDelay(3, 500)).toBe(2000);
  });

  it("does not retry a plain Error", async () => {
    const { sleep } = instantSleep();
    const task = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(withRetry(task, { sleep })).rejects.toThrow("boom");
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("reports every retry", async () => {
    const { sleep } = instantSleep();
    const onRetry = vi.fn();
    const task    = vi.fn().mockRejectedValueOnce(providerError("timeout")).mockResolvedValue("ok");

    await withRetry(task, { sleep, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toBe(1);
  });
});
