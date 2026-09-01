import path from "node:path";
import process from "node:process";

import { probeProviders, resolveWorkspace } from "@glossic/core";

import { runCheck } from "./commands/check.js";
import { collectDoctorReport, renderDoctorReport } from "./commands/doctor.js";
import type { GenerateCliOptions } from "./commands/generate.js";
import { runGenerate } from "./commands/generate.js";
import { runScan } from "./commands/scan.js";
import { resolveEffectiveConfig } from "./config.js";
import type { MessageKey, Translator } from "./i18n/messages.js";
import { createTranslator, UI_LANGUAGES } from "./i18n/messages.js";
import { LANGUAGES } from "./language.js";
import type { Preferences, PreferencesLocation } from "./preferences.js";
import { writePreferences } from "./preferences.js";
import { builtinAdapters, builtinProviders } from "./registries.js";
import type { PromptPort } from "./ui/prompts.js";
import { clackPrompts } from "./ui/prompts.js";
import { accent, dim } from "./ui/theme.js";

type Choice = "scan" | "generate" | "check" | "doctor" | "uiLanguage" | "docLanguage" | "exit";

export interface InteractiveDeps {
  prompts?: PromptPort;
  /** The very same entry points the flags go through. */
  runScan?: typeof runScan;
  runGenerate?: typeof runGenerate;
  runCheck?: typeof runCheck;
  cwd?: string;
  /** Injectable so tests neither read nor write the real user config. */
  preferences?: PreferencesLocation;
  resolveConfig?: typeof resolveEffectiveConfig;
  writePreferences?: typeof writePreferences;
}

export interface StatusLine {
  project: string;
  provider: string | undefined;
  /** The documentation language, not the interface one. */
  language: string;
}

/** The language's own name, in the interface language. */
const languageLabel = (t: Translator, code: string): string => {
  const key = `language.${code}` as MessageKey;
  const name = t(key);
  return name === key ? code : name;
};

/**
 * `riqsi-frontend · claude-code · docs in Spanish`
 *
 * The language is spelled out as the documentation's, not the interface's:
 * "· Spanish" on its own read as though the menu had been translated.
 */
export const renderStatusLine = (status: StatusLine, t: Translator): string =>
  [
    accent(status.project),
    status.provider ?? dim(t("status.noProvider")),
    dim(t("status.docsIn", { language: languageLabel(t, status.language) })),
  ].join(dim(" · "));

const readStatus = async (root: string, language: string): Promise<StatusLine> => {
  const [workspace, providers] = await Promise.all([
    resolveWorkspace(root),
    probeProviders(builtinProviders),
  ]);

  return {
    project: workspace.name,
    provider: providers.find((entry) => entry.available)?.name,
    language,
  };
};

const cancelled = (prompts: PromptPort, t: Translator): number => {
  prompts.cancel(t("menu.cancelled"));
  return 0;
};

/** A picker over language codes, preselected on the one in force. */
const pickLanguage = async (
  prompts: PromptPort,
  t: Translator,
  message: MessageKey,
  codes: readonly string[],
  current: string,
): Promise<string | undefined> => {
  const chosen = await prompts.select<string>({
    message: t(message),
    options: codes.map((code) => ({
      value: code,
      label: languageLabel(t, code),
      ...(code === current ? { hint: t("prompt.hint.current") } : {}),
    })),
    initialValue: current,
  });

  return prompts.isCancel(chosen) || typeof chosen !== "string" ? undefined : chosen;
};

/**
 * The menu shown by a bare `glossic`. Every branch calls the function the
 * matching flag would have called: this file asks the questions, it never
 * reimplements the work.
 */
export const runInteractive = async (deps: InteractiveDeps = {}): Promise<number> => {
  const prompts = deps.prompts ?? clackPrompts;
  const cwd = deps.cwd ?? process.cwd();
  const scan = deps.runScan ?? runScan;
  const generate = deps.runGenerate ?? runGenerate;
  const check = deps.runCheck ?? runCheck;
  const resolve = deps.resolveConfig ?? resolveEffectiveConfig;
  const save = deps.writePreferences ?? writePreferences;
  const location = deps.preferences ?? {};

  const root = path.resolve(cwd);
  const { config } = await resolve({ root, location });

  let language = config.lang;
  let uiLang: string = config.uiLang;
  let first = true;

  const remember = async (update: Preferences): Promise<void> => {
    await save(update, location);
  };

  // Choosing a language comes back here, so both the status line and every
  // label are redrawn with the new value instead of going stale until the
  // next run.
  for (;;) {
    const t = createTranslator(uiLang);
    const status = await readStatus(root, language);
    const line = renderStatusLine(status, t);

    if (first) prompts.intro(line);
    else prompts.note(line);
    first = false;

    // "free" read as a pricing tier. What it means is that nothing calls a model.
    const noAiCalls = t("menu.hint.noAiCalls");

    const choice = await prompts.select<Choice>({
      message: t("menu.question"),
      options: [
        { value: "scan", label: t("menu.scan"), hint: noAiCalls },
        {
          value: "generate",
          label: t("menu.generate"),
          hint: t("menu.hint.usesProvider", { provider: status.provider ?? "claude-code" }),
        },
        { value: "check", label: t("menu.check"), hint: noAiCalls },
        { value: "doctor", label: t("menu.doctor") },
        {
          value: "uiLanguage",
          label: t("menu.uiLanguage"),
          hint: t("menu.hint.current", { value: languageLabel(t, uiLang) }),
        },
        {
          value: "docLanguage",
          label: t("menu.docLanguage"),
          hint: t("menu.hint.current", { value: languageLabel(t, language) }),
        },
        { value: "exit", label: t("menu.exit") },
      ],
    });

    if (prompts.isCancel(choice) || choice === "exit") {
      prompts.cancel(t("menu.bye"));
      return 0;
    }

    if (choice === "uiLanguage") {
      const chosen = await pickLanguage(prompts, t, "prompt.uiLanguage", UI_LANGUAGES, uiLang);
      if (chosen !== undefined && chosen !== uiLang) {
        uiLang = chosen;
        await remember({ uiLang: chosen as "en" | "es" });
      }
      continue;
    }

    if (choice === "docLanguage") {
      const codes = LANGUAGES.map((entry) => entry.code);
      const chosen = await pickLanguage(prompts, t, "prompt.docLanguage", codes, language);
      if (chosen !== undefined && chosen !== language) {
        language = chosen;
        await remember({ lang: chosen });
      }
      continue;
    }

    if (choice === "scan") {
      await scan(".", { json: false, write: true });
      return 0;
    }

    if (choice === "check") {
      const result = await check(".", {});
      return result.ok ? 0 : 1;
    }

    if (choice === "doctor") {
      const report = await collectDoctorReport({
        root,
        providers: builtinProviders,
        adapters: builtinAdapters,
      });
      process.stdout.write(renderDoctorReport(report, t));
      return report.exitCode;
    }

    return generateInteractively(prompts, t, generate, language);
  }
};

const generateInteractively = async (
  prompts: PromptPort,
  t: Translator,
  generate: typeof runGenerate,
  resolved: string,
): Promise<number> => {
  // Already resolved from the chain, so this is an Enter rather than a
  // decision the user has to make again.
  const codes = LANGUAGES.map((entry) => entry.code);
  const language = await pickLanguage(prompts, t, "prompt.docLanguage", codes, resolved);
  if (language === undefined) return cancelled(prompts, t);

  const out = await prompts.text({
    message: t("prompt.outDir"),
    placeholder: "./docs",
    defaultValue: "./docs",
  });
  if (prompts.isCancel(out) || typeof out !== "string") return cancelled(prompts, t);

  const options: GenerateCliOptions = {
    lang: language,
    out: out === "" ? "./docs" : out,
  };

  // The plan and the estimate come from the real dry run, not a guess.
  const plan = await generate(".", { ...options, dryRun: true });

  const confirmed = await prompts.confirm({
    message: t("prompt.confirmGenerate", {
      units: plan.plan.filter((entry) => entry.regenerate).length,
      tokens: Math.round(plan.estimatedTokens / 1000),
    }),
    initialValue: true,
  });
  if (prompts.isCancel(confirmed) || confirmed !== true) return cancelled(prompts, t);

  const result = await generate(".", options);
  prompts.outro(t("prompt.outro", { generated: result.generated, failed: result.failures.length }));

  return result.failures.length > 0 ? 1 : 0;
};
