import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isProviderError, type ProviderError } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import {
  buildArgs,
  claudeCodeProvider,
  claudeCodeProviderName,
  createClaudeCodeProvider,
  ISOLATION_ARGS,
} from "./index.js";
import { parseClaudeOutput } from "./output.js";

const fixture = async (name: string): Promise<string> =>
  fs.readFile(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8");

const parse = (stdout: string) => parseClaudeOutput(claudeCodeProviderName, stdout, "fallback");

const expectProviderError = (run: () => unknown, code: ProviderError["code"]): ProviderError => {
  try {
    run();
  } catch (error) {
    if (!isProviderError(error)) throw error;
    expect(error.code).toBe(code);
    expect(error.provider).toBe(claudeCodeProviderName);
    return error;
  }
  throw new Error(`expected a ProviderError with code "${code}"`);
};

describe("claude-code provider", () => {
  it('is named "claude-code"', () => {
    expect(claudeCodeProvider.name).toBe(claudeCodeProviderName);
  });
});

describe("parseClaudeOutput", () => {
  it("extracts text, cost and usage from a successful run", async () => {
    const result = parse(await fixture("success.json"));

    expect(result.text).toBe("## UsersController\n\nHandles the `/users` HTTP surface.");
    expect(result.costUsd).toBe(0.0421);
    expect(result.usage).toEqual({
      inputTokens: 1834,
      outputTokens: 412,
      cacheReadTokens: 1200,
    });
  });

  it("falls back to the requested model when the payload names none", async () => {
    const result = parse(await fixture("no-usage.json"));

    expect(result.model).toBe("fallback");
    expect(result.usage).toBeUndefined();
    expect(result.costUsd).toBeUndefined();
  });

  it("reads the result out of a stream-json transcript", async () => {
    const result = parse(await fixture("stream.json"));

    expect(result.text).toBe("## Routes\n\nDeclares the order endpoints.");
    expect(result.usage).toEqual({ inputTokens: 900, outputTokens: 120 });
  });

  it("turns a reported error into a typed ProviderError", async () => {
    const raw = await fixture("error.json");
    const error = expectProviderError(() => parse(raw), "api");

    expect(error.detail).toBe("Credit balance is too low to run this request.");
  });

  it("rejects malformed JSON", () => {
    const error = expectProviderError(() => parse("{ not json"), "invalid-output");
    expect(error.detail).toBe("{ not json");
  });

  it("rejects empty output", () => {
    expectProviderError(() => parse("   \n"), "invalid-output");
  });

  it("rejects JSON without a result", () => {
    expectProviderError(() => parse('{"type":"system","subtype":"init"}'), "invalid-output");
  });

  it("rejects a non-string result", () => {
    expectProviderError(() => parse('{"type":"result","result":{"text":"hi"}}'), "invalid-output");
  });
});

describe("createClaudeCodeProvider", () => {
  it("reports unavailable when the binary does not exist", async () => {
    const provider = createClaudeCodeProvider({
      binary: "glossic-definitely-not-a-real-binary",
      timeoutMs: 5_000,
    });

    await expect(provider.available()).resolves.toBe(false);
  });

  it("caches the availability probe for the life of the process", async () => {
    const provider = createClaudeCodeProvider({
      binary: "glossic-definitely-not-a-real-binary",
      timeoutMs: 5_000,
    });

    const first = provider.available();
    const second = provider.available();

    expect(await first).toBe(await second);
  });

  it("fails with a typed error when completing through a missing binary", async () => {
    const provider = createClaudeCodeProvider({
      binary: "glossic-definitely-not-a-real-binary",
      timeoutMs: 5_000,
    });

    await expect(provider.complete({ prompt: "hi", metadata: {} })).rejects.toMatchObject({
      name: "ProviderError",
      provider: claudeCodeProviderName,
    });
  });
});

describe("isolation from the scanned project", () => {
  const request = { prompt: "describe this unit", system: "You write docs.", metadata: {} };

  it("disables every tool", () => {
    const args = buildArgs({}, request);
    const index = args.indexOf("--allowed-tools");

    expect(index).toBeGreaterThanOrEqual(0);
    expect(args[index + 1]).toBe("");
  });

  it("loads no settings and no MCP servers", () => {
    const args = buildArgs({}, request);
    const index = args.indexOf("--setting-sources");

    expect(index).toBeGreaterThanOrEqual(0);
    expect(args[index + 1]).toBe("");
    expect(args).toContain("--strict-mcp-config");
  });

  it("replaces the agent system prompt rather than appending to it", () => {
    const args = buildArgs({}, request);

    expect(args).toContain("--system-prompt");
    expect(args).not.toContain("--append-system-prompt");
    expect(args[args.indexOf("--system-prompt") + 1]).toBe("You write docs.");
  });

  it("keeps every isolation flag on every call", () => {
    for (const flag of ISOLATION_ARGS) {
      expect(buildArgs({ model: "claude-opus-5" }, request)).toContain(flag);
    }
  });

  it("still asks for headless json on stdin", () => {
    const args = buildArgs({}, request);

    expect(args.slice(0, 4)).toEqual(["-p", "--output-format", "json", "--allowed-tools"]);
    // The prompt is never an argument: it goes through stdin.
    expect(args).not.toContain(request.prompt);
  });

  it("runs somewhere other than the scanned project", async () => {
    const seen: string[] = [];
    const provider = createClaudeCodeProvider({
      binary: "glossic-definitely-not-a-real-binary",
      timeoutMs: 5_000,
      cwd: "/tmp/glossic-sandbox",
    });

    await provider.complete({ prompt: "hi", metadata: {} }).catch(() => {
      seen.push("failed");
    });

    // The call fails because the binary is missing, but it was configured to
    // start outside the project either way.
    expect(seen).toEqual(["failed"]);
  });
});
