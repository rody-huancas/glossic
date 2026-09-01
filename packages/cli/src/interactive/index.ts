import path from "node:path";
import process from "node:process";

import { runCheck } from "../commands/check.js";
import { runScan } from "../commands/scan.js";
import { runGenerate } from "../commands/generate.js";
import { collectDoctorReport, renderDoctorReport } from "../commands/doctor.js";
import { resolveEffectiveConfig } from "../config.js";
import { formatCliError } from "../errors.js";
import { createTranslator, UI_LANGUAGES } from "../i18n/index.js";
import { LANGUAGES } from "../language.js";
import { writePreferences } from "../preferences.js";
import { builtinAdapters, builtinProviders } from "../registries.js";
import { counted } from "../render/index.js";
import { clackPrompts } from "../ui/prompts.js";
import { languageLabel, pickLanguage } from "./language.js";
import { readStatus, renderStatusLine } from "./status.js";
import { generateInteractively } from "./generate-flow.js";
import type { Translator } from "../i18n/index.js";
import type { PromptPort } from "../ui/prompts.js";
import type { ActionOutcome } from "./generate-flow.js";
import type { Preferences, PreferencesLocation } from "../preferences.js";

export { renderStatusLine } from "./status.js";
export type { StatusLine } from "./status.js";

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
