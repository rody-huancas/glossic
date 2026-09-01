import path from "node:path";
import process from "node:process";

import { probeProviders, resolveWorkspace } from "@glossic/core";

import { runCheck } from "./commands/check.js";
import { collectDoctorReport, renderDoctorReport } from "./commands/doctor.js";
import type { GenerateCliOptions } from "./commands/generate.js";
import { runGenerate } from "./commands/generate.js";
import { runScan } from "./commands/scan.js";
import { resolveEffectiveConfig } from "./config.js";
import { formatCliError } from "./errors.js";
import type { MessageKey, Translator } from "./i18n/messages.js";
import { createTranslator, UI_LANGUAGES } from "./i18n/messages.js";
import { LANGUAGES } from "./language.js";
import type { Preferences, PreferencesLocation } from "./preferences.js";
import { writePreferences } from "./preferences.js";
import { builtinAdapters, builtinProviders } from "./registries.js";
import { counted } from "./render.js";
import type { PromptPort } from "./ui/prompts.js";
import { clackPrompts } from "./ui/prompts.js";
import { accent, dim } from "./ui/theme.js";

type Action = "scan" | "generate" | "check" | "doctor";
type Choice = Action | "uiLanguage" | "docLanguage" | "exit";

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

/**
 * Re-read on every turn: a provider can come up, a config can change, and the
 * line is the only thing telling the user what the next action will do.
 */
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

interface ActionOutcome {
  ok: boolean;
  /** Units the action happened to learn about, for the next menu's hint. */
  units?: number | undefined;
}

/**
 * The menu shown by a bare `glossic`. Every branch calls the function the
 * matching flag would have called: this file asks the questions, it never
 * reimplements the work.
 *
 * It is a loop. Opening the menu means staying in it: every action prints its
 * output, leaves it on screen and draws the menu again underneath. Only Exit
 * — or Ctrl+C, which clack surfaces as a cancel — ends the process.
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
  const defaultOut = config.output.dir;
  let uiLang: string = config.uiLang;
  let first = true;

  // Remembered across the session so the exit code can report it, and so the
  // menu can say what the last scan found without scanning again.
  let failed = false;
  let knownUnits: number | undefined;

  const remember = async (update: Preferences): Promise<void> => {
    await save(update, location);
  };

  const perform = async (choice: Action, t: Translator): Promise<ActionOutcome> => {
    try {
      if (choice === "scan") {
        const result = await scan(".", { json: false, write: true });
        return { ok: true, units: result.manifest.units.length };
      }

      if (choice === "check") {
        const result = await check(".", {});
        return { ok: result.ok };
      }

      if (choice === "doctor") {
        const report = await collectDoctorReport({
          root,
          providers: builtinProviders,
          adapters: builtinAdapters,
        });
        process.stdout.write(renderDoctorReport(report, t));
        return { ok: report.exitCode === 0 };
      }

      return generateInteractively(prompts, t, generate, language, defaultOut);
    } catch (error) {
      // A dead provider, a timeout, a bad path: worth reading, not worth
      // ending the session over.
      process.stderr.write(`${formatCliError(error)}\n`);
      prompts.note(t("menu.actionFailed"));
      return { ok: false };
    }
  };

  for (;;) {
    const t = createTranslator(uiLang);
    const status = await readStatus(root, language);
    const line = renderStatusLine(status, t);

    if (first) prompts.intro(line);
    else prompts.note(line);
    first = false;

    // "free" read as a pricing tier. What it means is that nothing calls a model.
    const noAiCalls = t("menu.hint.noAiCalls");
    const provider = status.provider ?? "claude-code";

    const generateHint =
      knownUnits === undefined
        ? t("menu.hint.usesProvider", { provider })
        : t("menu.hint.usesProviderUnits", {
            provider,
            units: counted(t, knownUnits, "unit"),
          });

    const choice = await prompts.select<Choice>({
      message: t("menu.question"),
      options: [
        { value: "scan", label: t("menu.scan"), hint: noAiCalls },
        { value: "generate", label: t("menu.generate"), hint: generateHint },
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

    // Ctrl+C reaches here as a cancel, and is the only other way out.
    if (prompts.isCancel(choice) || typeof choice !== "string" || choice === "exit") {
      prompts.cancel(t("menu.bye"));
      return failed ? 1 : 0;
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

    const outcome = await perform(choice, t);
    if (!outcome.ok) failed = true;
    if (outcome.units !== undefined) knownUnits = outcome.units;
  }
};

const generateInteractively = async (
  prompts: PromptPort,
  t: Translator,
  generate: typeof runGenerate,
  resolved: string,
  defaultOut: string,
): Promise<ActionOutcome> => {
  // Already resolved from the chain, so this is an Enter rather than a
  // decision the user has to make again.
  const codes = LANGUAGES.map((entry) => entry.code);
  const language = await pickLanguage(prompts, t, "prompt.docLanguage", codes, resolved);
  if (language === undefined) return cancelled(prompts, t);

  // The placeholder names the directory the config already points at, and an
  // empty answer accepts it. Substituting "./docs" here would quietly override
  // a project that configured somewhere else.
  const out = await prompts.text({
    message: t("prompt.outDir"),
    placeholder: defaultOut,
  });
  if (prompts.isCancel(out) || typeof out !== "string") return cancelled(prompts, t);

  const answer = out.trim();
  const options: GenerateCliOptions = {
    lang: language,
    ...(answer === "" ? {} : { out: answer }),
  };

  // The plan and the estimate come from the real dry run, not a guess.
  const plan = await generate(".", { ...options, dryRun: true });
  const units = plan.plan.length;

  const confirmed = await prompts.confirm({
    message: t("prompt.confirmGenerate", {
      units: plan.plan.filter((entry) => entry.regenerate).length,
      tokens: Math.round(plan.estimatedTokens / 1000),
    }),
    initialValue: true,
  });
  if (prompts.isCancel(confirmed) || confirmed !== true) return { ...cancelled(prompts, t), units };

  const result = await generate(".", options);
  prompts.outro(t("prompt.outro", { generated: result.generated, failed: result.failures.length }));

  return { ok: result.failures.length === 0, units };
};

/** Backing out of a prompt is a choice, not a failure. */
const cancelled = (prompts: PromptPort, t: Translator): ActionOutcome => {
  prompts.cancel(t("menu.cancelled"));
  return { ok: true };
};
