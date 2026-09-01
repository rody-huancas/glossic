import type Anthropic from "@anthropic-ai/sdk";
import { isProviderError } from "@glossic/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANTHROPIC_DEFAULT_MODEL,
  acceptsTemperature,
  anthropicProviderName,
  createAnthropicProvider,
} from "../index.js";

const message = (overrides: Partial<Anthropic.Message> = {}): Anthropic.Message =>
  ({
    id           : "msg_test",
    type         : "message",
    role         : "assistant",
    model        : "claude-opus-5",
    content      : [{ type: "text", text: "## Users\n\nHandles users.", citations: null }],
    stop_reason  : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens               : 120,
      output_tokens              : 40,
      cache_creation_input_tokens: null,
      cache_read_input_tokens    : 12,
    },
    ...overrides,
  }) as Anthropic.Message;

const fakeClient = (create: ReturnType<typeof vi.fn>): Anthropic =>
  ({ messages: { create } }) as unknown as Anthropic;

const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

describe("anthropic provider", () => {
  it("is unavailable without an API key", async () => {
    const provider = createAnthropicProvider();
    await expect(provider.available()).resolves.toBe(false);
  });

  it("is available once ANTHROPIC_API_KEY is set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    const provider = createAnthropicProvider();
    await expect(provider.available()).resolves.toBe(true);
  });

  it("ignores a blank API key", async () => {
    process.env.ANTHROPIC_API_KEY = "   ";
    await expect(createAnthropicProvider().available()).resolves.toBe(false);
  });

  it("fails with a typed error when completing without a key", async () => {
    const provider = createAnthropicProvider();

    await expect(provider.complete({ prompt: "hi", metadata: {} })).rejects.toMatchObject({
      name    : "ProviderError",
      code    : "unauthenticated",
      provider: anthropicProviderName,
    });
  });

  it("maps a completion into a CompletionResult", async () => {
    const create = vi.fn().mockResolvedValue(message());
    const provider = createAnthropicProvider({
      apiKey      : "sk-ant-test",
      createClient: () => fakeClient(create),
    });

    const result = await provider.complete({ prompt: "describe this", metadata: {} });

    expect(result.text).toBe("## Users\n\nHandles users.");
    expect(result.model).toBe("claude-opus-5");
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 40, cacheReadTokens: 12 });
  });

  it("does not send temperature to models that reject sampling", async () => {
    const create = vi.fn().mockResolvedValue(message());
    const provider = createAnthropicProvider({
      apiKey      : "sk-ant-test",
      createClient: () => fakeClient(create),
    });

    await provider.complete({ prompt: "hi", metadata: {} });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ model: ANTHROPIC_DEFAULT_MODEL });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("temperature");
  });

  it("defaults to temperature 0 on models that accept sampling", async () => {
    const create = vi.fn().mockResolvedValue(message({ model: "claude-haiku-4-5" }));
    const provider = createAnthropicProvider({
      apiKey      : "sk-ant-test",
      model       : "claude-haiku-4-5",
      createClient: () => fakeClient(create),
    });

    await provider.complete({ prompt: "hi", metadata: {} });

    expect(create.mock.calls[0]?.[0]).toMatchObject({ temperature: 0 });
  });

  it("surfaces a refusal as a typed error", async () => {
    const create = vi.fn().mockResolvedValue(message({ stop_reason: "refusal", content: [] }));
    const provider = createAnthropicProvider({
      apiKey      : "sk-ant-test",
      createClient: () => fakeClient(create),
    });

    await expect(provider.complete({ prompt: "hi", metadata: {} })).rejects.toMatchObject({
      code: "refused",
    });
  });

  it("wraps transport failures in a ProviderError", async () => {
    const create = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const provider = createAnthropicProvider({
      apiKey      : "sk-ant-test",
      createClient: () => fakeClient(create),
    });

    const error = await provider.complete({ prompt: "hi", metadata: {} }).catch((e: unknown) => e);

    expect(isProviderError(error)).toBe(true);
  });

  it("knows which models reject sampling parameters", () => {
    expect(acceptsTemperature("claude-opus-5")).toBe(false);
    expect(acceptsTemperature("claude-sonnet-5")).toBe(false);
    expect(acceptsTemperature("claude-fable-5")).toBe(false);
    expect(acceptsTemperature("claude-haiku-4-5")).toBe(true);
    expect(acceptsTemperature("claude-opus-4-6")).toBe(true);
  });
});
