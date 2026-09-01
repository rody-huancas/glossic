import type { GenerateResult } from "@glossic/core";
import { describe, expect, it, vi } from "vitest";

import type { InteractiveDeps } from "./interactive.js";
import { renderStatusLine, runInteractive } from "./interactive.js";
import type { PromptPort } from "./ui/prompts.js";

const CANCEL = Symbol("cancel");

/** A prompt port that answers from a script instead of a terminal. */
const scriptedPrompts = (answers: unknown[]) => {
  const asked: string[] = [];
  let cursor = 0;

  const next = async (message: string): Promise<never> => {
    asked.push(message);
    return answers[cursor++] as never;
  };

  const port: PromptPort = {
    intro: (message) => asked.push(`intro:${message}`),
    outro: (message) => asked.push(`outro:${message}`),
    note: (message) => asked.push(`note:${message}`),
    cancel: (message) => asked.push(`cancel:${message}`),
    select: (options) => {
      for (const option of options.options) {
        if (option.hint !== undefined) asked.push(`hint:${String(option.value)}:${option.hint}`);
      }
      return next(options.message);
    },
    text: (options) => next(options.message),
    confirm: (options) => next(options.message),
    isCancel: (value) => value === CANCEL,
  };

  return { port, asked };
};

const emptyGenerateResult = (overrides: Partial<GenerateResult> = {}): GenerateResult =>
  ({
    manifest: { version: "1", generatedAt: "", workspace: {}, units: [], relations: [] },
    written: [],
    plan: [
      {
        unitId: "root:src",
        docPath: "src.md",
        files: 1,
        estimatedTokens: 2000,
        reason: "new",
        regenerate: true,
      },
    ],
    failures: [],
    warnings: [],
    filteredOut: [],
    estimatedTokens: 2000,
    savedTokens: 0,
    generated: 1,
    fromCache: 0,
    dryRun: false,
    ...overrides,
  }) as GenerateResult;

const deps = (answers: unknown[], overrides: Partial<InteractiveDeps> = {}): InteractiveDeps => ({
  prompts: scriptedPrompts(answers).port,
  cwd: process.cwd(),
  resolveLanguage: async () => ({ language: "es", origin: "preference" }),
  writePreferences: async () => "/tmp/glossic/config.json",
  ...overrides,
});

describe("renderStatusLine", () => {
  it("names the language as the documentation's, not the interface's", () => {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
    const strip = (value: string): string => value.replace(/\u001b\[[0-9;]*m/g, "");

    expect(
      strip(renderStatusLine({ project: "riqsi", provider: "claude-code", language: "es" })),
    ).toBe("riqsi · claude-code · docs in Spanish");
  });

  it("says so when no provider answered", () => {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
    const strip = (value: string): string => value.replace(/\u001b\[[0-9;]*m/g, "");

    expect(strip(renderStatusLine({ project: "demo", provider: undefined, language: "en" }))).toBe(
      "demo · no provider · docs in English",
    );
  });
});

describe("runInteractive", () => {
  it("exits without doing anything when the user picks Salir", async () => {
    const runScan = vi.fn();
    const code = await runInteractive(deps(["exit"], { runScan }));

    expect(code).toBe(0);
    expect(runScan).not.toHaveBeenCalled();
  });

  it("exits without doing anything when the user cancels", async () => {
    const runScan = vi.fn();
    const code = await runInteractive(deps([CANCEL], { runScan }));

    expect(code).toBe(0);
    expect(runScan).not.toHaveBeenCalled();
  });

  it("scanning calls the very function the scan command calls", async () => {
    const runScan = vi.fn().mockResolvedValue(undefined);
    await runInteractive(deps(["scan"], { runScan }));

    expect(runScan).toHaveBeenCalledTimes(1);
    expect(runScan.mock.calls[0]?.[0]).toBe(".");
  });

  it("checking calls the very function the check command calls", async () => {
    const runCheck = vi.fn().mockResolvedValue({ ok: false });
    const code = await runInteractive(deps(["check"], { runCheck }));

    expect(runCheck).toHaveBeenCalledTimes(1);
    expect(code).toBe(1);
  });

  it("generating asks for language and output, then confirms before spending", async () => {
    const runGenerate = vi
      .fn()
      .mockResolvedValueOnce(emptyGenerateResult({ dryRun: true }))
      .mockResolvedValueOnce(emptyGenerateResult());

    const script = scriptedPrompts(["generate", "es", "./documentacion", true]);
    const code = await runInteractive({
      prompts: script.port,
      resolveLanguage: async () => ({ language: "es", origin: "preference" }),
      writePreferences: async () => "/tmp/glossic/config.json",
      runGenerate,
    });

    expect(code).toBe(0);
    expect(runGenerate).toHaveBeenCalledTimes(2);

    // First the plan, then the real run — the same entry point both times.
    expect(runGenerate.mock.calls[0]?.[1]).toMatchObject({
      dryRun: true,
      lang: "es",
      out: "./documentacion",
    });
    expect(runGenerate.mock.calls[1]?.[1]).toEqual({ lang: "es", out: "./documentacion" });
    expect(runGenerate.mock.calls[1]?.[1]).not.toHaveProperty("dryRun");

    // The estimate the user was shown came from the dry run.
    expect(script.asked.some((message) => message.includes("2k input tokens"))).toBe(true);
  });

  it("does not call the provider when the confirmation is declined", async () => {
    const runGenerate = vi.fn().mockResolvedValue(emptyGenerateResult({ dryRun: true }));

    const code = await runInteractive(deps(["generate", "en", "./docs", false], { runGenerate }));

    expect(code).toBe(0);
    // Only the dry run happened.
    expect(runGenerate).toHaveBeenCalledTimes(1);
    expect(runGenerate.mock.calls[0]?.[1]).toMatchObject({ dryRun: true });
  });

  it("reports a failing run with exit 1", async () => {
    const runGenerate = vi
      .fn()
      .mockResolvedValueOnce(emptyGenerateResult({ dryRun: true }))
      .mockResolvedValueOnce(
        emptyGenerateResult({
          failures: [{ unitId: "root:src", reason: "boom", code: "api", detail: undefined }],
        }),
      );

    const code = await runInteractive(deps(["generate", "es", "", true], { runGenerate }));

    expect(code).toBe(1);
    expect(runGenerate.mock.calls[1]?.[1]).toMatchObject({ out: "./docs" });
  });
});

describe("the documentation language option", () => {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
  const strip = (value: string): string => value.replace(/\u001b\[[0-9;]*m/g, "");

  it("offers the current language as the hint", async () => {
    const script = scriptedPrompts(["exit"]);
    await runInteractive({
      prompts: script.port,
      resolveLanguage: async () => ({ language: "es", origin: "preference" }),
    });

    expect(script.asked).toContain("hint:language:currently: Spanish");
  });

  it("redraws the status line with the new language and stays in the menu", async () => {
    const script = scriptedPrompts(["language", "pt", "exit"]);
    const saved: unknown[] = [];

    const code = await runInteractive({
      prompts: script.port,
      resolveLanguage: async () => ({ language: "es", origin: "preference" }),
      writePreferences: async (update) => {
        saved.push(update);
        return "/tmp/glossic/config.json";
      },
    });

    expect(code).toBe(0);
    expect(saved).toEqual([{ lang: "pt" }]);

    // The first status line said Spanish; the one after the change says Portuguese.
    const lines = script.asked.filter(
      (entry) => entry.startsWith("intro:") || entry.startsWith("note:"),
    );
    expect(strip(lines[0] ?? "")).toContain("docs in Spanish");
    expect(strip(lines[1] ?? "")).toContain("docs in Portuguese");

    // And the menu was shown again with the updated hint.
    expect(script.asked).toContain("hint:language:currently: Portuguese");
  });

  it("saves nothing when the same language is picked again", async () => {
    const script = scriptedPrompts(["language", "es", "exit"]);
    const saved: unknown[] = [];

    await runInteractive({
      prompts: script.port,
      resolveLanguage: async () => ({ language: "es", origin: "preference" }),
      writePreferences: async (update) => {
        saved.push(update);
        return "/tmp/glossic/config.json";
      },
    });

    expect(saved).toEqual([]);
  });

  it("saves nothing when the picker is cancelled", async () => {
    const script = scriptedPrompts(["language", CANCEL, "exit"]);
    const saved: unknown[] = [];

    await runInteractive({
      prompts: script.port,
      resolveLanguage: async () => ({ language: "es", origin: "preference" }),
      writePreferences: async (update) => {
        saved.push(update);
        return "/tmp/glossic/config.json";
      },
    });

    expect(saved).toEqual([]);
  });

  it("carries the chosen language into a generate run", async () => {
    const runGenerate = vi
      .fn()
      .mockResolvedValueOnce(emptyGenerateResult({ dryRun: true }))
      .mockResolvedValueOnce(emptyGenerateResult());

    await runInteractive({
      prompts: scriptedPrompts(["language", "fr", "generate", "fr", "./docs", true]).port,
      resolveLanguage: async () => ({ language: "es", origin: "system" }),
      writePreferences: async () => "/tmp/glossic/config.json",
      runGenerate,
    });

    expect(runGenerate.mock.calls[1]?.[1]).toMatchObject({ lang: "fr" });
  });
});
