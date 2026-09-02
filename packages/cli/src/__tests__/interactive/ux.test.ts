import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { GlossicConfigSchema } from "@glossic/schema";
import { afterAll, describe, expect, it, vi } from "vitest";

import { renderDoctorReport, renderDoctorSummary } from "../../commands/doctor.js";
import type { DoctorReport } from "../../commands/doctor.js";
import { runConnection } from "../../interactive/connection.js";
import { createTranslator } from "../../i18n/index.js";
import { runInteractive } from "../../interactive/index.js";
import { maskSecret, readPreferences, writePreferences } from "../../preferences.js";
import type { PreferencesLocation } from "../../preferences.js";
import type { PromptPort } from "../../ui/prompts.js";

const CANCEL   = Symbol("cancel");
const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A preferences file of its own, so nothing here touches the real one. */
const tempLocation = async (): Promise<PreferencesLocation> => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-prefs-"));
  tempDirs.push(home);

  return { env: { XDG_CONFIG_HOME: home, APPDATA: home }, platform: "linux", homedir: home };
};

/**
 * A prompt port that answers from a script and records what it was asked, so a
 * test can assert on the screen being wiped as well as on the answers.
 */
const scripted = (answers: unknown[], canClear = true) => {
  const seen: string[] = [];
  let cursor           = 0;

  const next = async (label: string): Promise<never> => {
    seen.push(label);

    if (cursor >= answers.length) {
      throw new Error(`the script ran out after ${seen.length} prompts: ${label}`);
    }

    return answers[cursor++] as never;
  };

  const port: PromptPort = {
    intro   : (message) => seen.push(`intro:${message}`),
    outro   : (message) => seen.push(`outro:${message}`),
    note    : (message) => seen.push(`note:${message}`),
    cancel  : (message) => seen.push(`cancel:${message}`),
    select  : (options) => next(`select:${options.message}`),
    text    : (options) => next(`text:${options.message}`),
    password: (options) => next(`password:${options.message}`),
    confirm : (options) => next(`confirm:${options.message}`),
    clear   : () => {
      seen.push("clear");
      return canClear;
    },
    pause: async (message) => {
      seen.push(`pause:${message}`);
    },
    isCancel: (value) => value === CANCEL,
  };

  return { port, seen };
};

const fakeConfig = () => async () => ({
  config : GlossicConfigSchema.parse({ lang: "en", uiLang: "en" }),
  origins: {},
  project: { status: "missing" } as const,
});

const scanResult = (units: number) => ({
  manifest: { units: Array.from({ length: units }, (_, i) => ({ id: `u${i}` })) },
});

const t = createTranslator("en");

describe("returning to the menu wipes the screen", () => {
  it("clears and redraws the banner and the status line on every turn", async () => {
    const script = scripted(["scan", "exit"]);

    await runInteractive({
      prompts      : script.port,
      resolveConfig: fakeConfig(),
      runScan      : vi.fn().mockResolvedValue(scanResult(2)) as never,
    });

    // Two turns: the one that runs the scan and the one that exits.
    expect(script.seen.filter((entry) => entry === "clear")).toHaveLength(2);

    // The status line is drawn fresh each turn rather than appended below.
    expect(script.seen.filter((entry) => entry.startsWith("intro:"))).toHaveLength(2);
    expect(script.seen.some((entry) => entry.startsWith("note:"))).toBe(false);
  });

  it("holds output on screen until the reader says they are done", async () => {
    const script = scripted(["scan", "exit"]);

    await runInteractive({
      prompts      : script.port,
      resolveConfig: fakeConfig(),
      runScan      : vi.fn().mockResolvedValue(scanResult(1)) as never,
    });

    expect(script.seen).toContain(`pause:${t("menu.continue")}`);
  });

  it("waits after the action and before wiping it away", async () => {
    const script = scripted(["scan", "exit"]);

    await runInteractive({
      prompts      : script.port,
      resolveConfig: fakeConfig(),
      runScan      : vi.fn().mockResolvedValue(scanResult(1)) as never,
    });

    const pause = script.seen.indexOf(`pause:${t("menu.continue")}`);
    const wipes = script.seen
      .map((entry, index) => (entry === "clear" ? index : -1))
      .filter((index) => index !== -1);

    expect(pause).toBeGreaterThan(wipes[0] as number);
    expect(pause).toBeLessThan(wipes[1] as number);
  });
});

describe("without a terminal to wipe", () => {
  it("keeps the old behaviour and never waits for a keypress", async () => {
    const script = scripted(["scan", "exit"], false);

    await runInteractive({
      prompts      : script.port,
      resolveConfig: fakeConfig(),
      runScan      : vi.fn().mockResolvedValue(scanResult(1)) as never,
    });

    expect(script.seen.some((entry) => entry.startsWith("pause:"))).toBe(false);

    // The status line is appended under the previous output, as it always was.
    expect(script.seen.filter((entry) => entry.startsWith("intro:"))).toHaveLength(1);
    expect(script.seen.filter((entry) => entry.startsWith("note:"))).toHaveLength(1);
  });
});

describe("backing out of a prompt", () => {
  it("returns to the menu without running anything, and without failing", async () => {
    const runGenerate = vi.fn();
    const script      = scripted(["generate", CANCEL, "exit"]);

    const code = await runInteractive({
      prompts      : script.port,
      resolveConfig: fakeConfig(),
      runGenerate  : runGenerate as never,
    });

    expect(runGenerate).not.toHaveBeenCalled();
    expect(code).toBe(0);
    expect(script.seen.filter((entry) => entry.startsWith("select:What would"))).toHaveLength(2);
  });

  it("treats the explicit Back entry exactly like a cancel", async () => {
    const runGenerate = vi.fn();
    const script      = scripted(["generate", "::back", "exit"]);

    const code = await runInteractive({
      prompts      : script.port,
      resolveConfig: fakeConfig(),
      runGenerate  : runGenerate as never,
    });

    expect(runGenerate).not.toHaveBeenCalled();
    expect(code).toBe(0);
  });

  it("offers Back as the first entry of a nested selector", async () => {
    const labels: string[] = [];
    const script           = scripted(["docLanguage", CANCEL, "exit"]);

    const port: PromptPort = {
      ...script.port,
      select: (options) => {
        labels.push(options.options[0]?.label ?? "");
        return script.port.select(options);
      },
    };

    await runInteractive({ prompts: port, resolveConfig: fakeConfig() });

    // The first selector is the main menu; the second is the language picker.
    expect(labels[1]).toBe(t("nav.back"));
  });

  it("does not fail the run when the confirmation is declined", async () => {
    const runGenerate = vi.fn().mockResolvedValue({
      plan           : [{ regenerate: true }],
      estimatedTokens: 1000,
      generated      : 0,
      failures       : [],
    });

    const script = scripted(["generate", "en", "", false, "exit"]);

    const code = await runInteractive({
      prompts      : script.port,
      resolveConfig: fakeConfig(),
      runGenerate  : runGenerate as never,
    });

    // Only the dry run happened; the real one never did.
    expect(runGenerate).toHaveBeenCalledTimes(1);
    expect(code).toBe(0);
  });
});

describe("the saved provider", () => {
  it("persists and outranks auto-detection", async () => {
    const location = await tempLocation();

    await writePreferences({ provider: "anthropic" }, location);

    expect(await readPreferences(location)).toMatchObject({ provider: "anthropic" });

    const { resolveEffectiveConfig } = await import("../../config.js");
    const { config, origins } = await resolveEffectiveConfig({ root: process.cwd(), location });

    expect(config.provider).toBe("anthropic");
    expect(origins.provider).toBe("preference");
  });

  it("loses to an explicit flag and to the project config", async () => {
    const location = await tempLocation();

    await writePreferences({ provider: "anthropic" }, location);

    const { resolveEffectiveConfig } = await import("../../config.js");
    const { config, origins } = await resolveEffectiveConfig({
      root : process.cwd(),
      flags: { provider: "claude-code" },
      location,
    });

    expect(config.provider).toBe("claude-code");
    expect(origins.provider).toBe("flag");
  });
});

describe("the saved API key", () => {
  it("is written, read back and never mixed into the configuration", async () => {
    const location = await tempLocation();

    await writePreferences({ anthropicApiKey: "sk-ant-secret-value-1234" }, location);

    expect(await readPreferences(location)).toMatchObject({
      anthropicApiKey: "sk-ant-secret-value-1234",
    });

    const { resolveEffectiveConfig } = await import("../../config.js");
    const { config, origins } = await resolveEffectiveConfig({ root: process.cwd(), location });

    expect(Object.keys(config)).not.toContain("anthropicApiKey");
    expect(Object.keys(origins)).not.toContain("anthropicApiKey");
  });

  it("shows only its last four characters", () => {
    expect(maskSecret("sk-ant-secret-value-1234")).toBe(`${"•".repeat(8)}1234`);
    expect(maskSecret("sk-ant-secret-value-1234")).not.toContain("secret");

    // A mask of fixed width does not give the length of the key away either.
    expect(maskSecret("sk-ant-short-9999")).toHaveLength(maskSecret("sk-ant-much-longer-9999").length);
  });

  it.skipIf(process.platform === "win32")("is written so that only its owner can read it", async () => {
    const location = await tempLocation();
    const target   = await writePreferences({ anthropicApiKey: "sk-ant-1234" }, location);

    expect((await fs.stat(target)).mode & 0o777).toBe(0o600);

    // Saving again over an existing file must not loosen it.
    await writePreferences({ lang: "es" }, location);
    expect((await fs.stat(target)).mode & 0o777).toBe(0o600);
  });
});

describe("the connection submenu", () => {
  it("saves the provider only once it has answered", async () => {
    const location = await tempLocation();
    const script   = scripted(["claudeCode", "::back"]);

    await runConnection({
      prompts         : script.port,
      t,
      root            : process.cwd(),
      location,
      verifyClaudeCode: async () => true,
    });

    expect(await readPreferences(location)).toMatchObject({ provider: "claude-code" });
  });

  it("saves nothing when the provider does not answer", async () => {
    const location = await tempLocation();
    const script   = scripted(["claudeCode", "::back"]);

    await runConnection({
      prompts         : script.port,
      t,
      root            : process.cwd(),
      location,
      verifyClaudeCode: async () => false,
    });

    expect(await readPreferences(location)).toEqual({});
    expect(script.seen).toContain(`note:${t("connection.claudeCodeMissing")}`);
  });

  it("saves nothing when the key does not work, and never echoes it", async () => {
    const location = await tempLocation();
    const script   = scripted(["anthropic", "sk-ant-bad-key-0000", "::back"]);

    await runConnection({
      prompts     : script.port,
      t,
      root        : process.cwd(),
      location,
      verifyApiKey: async () => false,
    });

    expect(await readPreferences(location)).toEqual({});
    expect(script.seen.join("\n")).not.toContain("sk-ant-bad-key-0000");
  });

  it("forgets the key and the pinned provider together", async () => {
    const location = await tempLocation();

    await writePreferences({ provider: "anthropic", anthropicApiKey: "sk-ant-1234" }, location);

    const script = scripted(["forget", "::back"]);

    await runConnection({ prompts: script.port, t, root: process.cwd(), location });

    const saved = await readPreferences(location);

    expect(saved.anthropicApiKey).toBeUndefined();
    expect(saved.provider).toBeUndefined();
  });

  it("leaves through Back without touching anything", async () => {
    const location = await tempLocation();
    const script   = scripted(["::back"]);

    const outcome = await runConnection({ prompts: script.port, t, root: process.cwd(), location });

    expect(outcome).toEqual({ ok: true, printed: false });
    expect(await readPreferences(location)).toEqual({});
  });
});

describe("the status the menu shows", () => {
  const report: DoctorReport = {
    node         : "22.20.0",
    platform     : "linux-x64",
    providers    : [{ name: "claude-code", available: true }],
    selected     : "claude-code",
    adapters     : ["nestjs", "treesitter", "generic"],
    projectConfig: { status: "missing" },
    config       : [{ key: "concurrency", value: "3", origin: "default" }],
    lang         : "es",
    uiLang       : "en",
    exitCode     : 0,
  };

  it("names the runtime, the provider, the adapters and both languages", () => {
    const summary = renderDoctorSummary(report, t);

    expect(summary).toContain("22.20.0");
    expect(summary).toContain("claude-code");
    expect(summary).toContain("nestjs, treesitter, generic");
    expect(summary).toContain("Spanish");
    expect(summary).toContain("English");
  });

  it("leaves the table of effective configuration to the command line", () => {
    const summary = renderDoctorSummary(report, t);

    expect(summary).not.toContain(t("doctor.effectiveConfig"));
    expect(summary).not.toContain("concurrency");

    // The full report, which `glossic doctor` prints, still carries it.
    expect(renderDoctorReport(report, t)).toContain(t("doctor.effectiveConfig"));
    expect(renderDoctorReport(report, t)).toContain("concurrency");
  });

  it("says so when nothing can write prose", () => {
    const summary = renderDoctorSummary({ ...report, selected: undefined }, t);

    expect(summary).toContain(t("status.noProvider"));
    expect(summary).toContain(t("doctor.noProvider"));
  });
});
