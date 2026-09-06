import path from "node:path";
import process from "node:process";

import { readManifest } from "@glossic/core";

import { counted } from "../render/index.js";
import { runScan } from "../commands/scan.js";
import { runCheck } from "../commands/check.js";
import { runEject } from "../commands/eject/index.js";
import { printBanner } from "../ui/banner.js";
import { runGenerate } from "../commands/generate/index.js";
import { pickLanguage } from "./language.js";
import { clackPrompts } from "../ui/prompts.js";
import { runConnection } from "./connection.js";
import { resolveDocsDir } from "../docs-dir.js";
import { formatCliError } from "../errors.js";
import { hasGeneratedDocs } from "./docs.js";
import { writePreferences } from "../preferences.js";
import { generateInteractively } from "./generate-flow.js";
import { resolveEffectiveConfig } from "../config.js";
import { LANGUAGES, languageLabel } from "../language.js";
import { readStatus, renderStatusLine } from "./status.js";
import { createTranslator, UI_LANGUAGES } from "../i18n/index.js";
import type { Translator } from "../i18n/index.js";
import type { PromptPort } from "../ui/prompts.js";
import type { ActionOutcome } from "./nav.js";
import type { PreferencesLocation, PreferencesUpdate } from "../preferences.js";

export { renderStatusLine } from "./status.js";
export type { StatusLine } from "./status.js";

type Action = "scan" | "generate" | "eject" | "check" | "connection";
type Choice = Action | "uiLanguage" | "docLanguage" | "exit";

export interface InteractiveDeps {
  prompts         ?: PromptPort;
  runScan         ?: typeof runScan;
  runGenerate     ?: typeof runGenerate;
  runCheck        ?: typeof runCheck;
  runEject        ?: typeof runEject;
  runConnection   ?: typeof runConnection;
  hasDocs         ?: typeof hasGeneratedDocs;
  cwd             ?: string;
  preferences     ?: PreferencesLocation;
  resolveConfig   ?: typeof resolveEffectiveConfig;
  writePreferences?: typeof writePreferences;
}

export const runInteractive = async (deps: InteractiveDeps = {}): Promise<number> => {
  const prompts    = deps.prompts ?? clackPrompts;
  const cwd        = deps.cwd ?? process.cwd();
  const scan       = deps.runScan ?? runScan;
  const generate   = deps.runGenerate ?? runGenerate;
  const check      = deps.runCheck ?? runCheck;
  const eject      = deps.runEject ?? runEject;
  const connection = deps.runConnection ?? runConnection;
  const hasDocs    = deps.hasDocs ?? hasGeneratedDocs;
  const resolve    = deps.resolveConfig ?? resolveEffectiveConfig;
  const save       = deps.writePreferences ?? writePreferences;
  const location   = deps.preferences ?? {};

  const root       = path.resolve(cwd);
  const { config } = await resolve({ root, location });

  let language       = config.lang;
  let uiLang: string = config.uiLang;
  let first          = true;

  let failed = false;
  let knownUnits: number | undefined;

  let sessionDocs: string | undefined;

  const remember = async (update: PreferencesUpdate): Promise<void> => {
    await save(update, location);
  };

  const perform = async (choice: Action, t: Translator, defaultOut: string): Promise<ActionOutcome> => {
    try {
      if (choice === "scan") {
        const result = await scan(".", { json: false, write: true });

        return { ok: true, units: result.manifest.units.length, printed: true };
      }

      if (choice === "check") {
        const result = await check(".", sessionDocs === undefined ? {} : { docs: sessionDocs });

        return { ok: result.ok, printed: true };
      }

      if (choice === "eject") {
        const result = await eject(".", sessionDocs === undefined ? {} : { docs: sessionDocs });

        prompts.note(counted(t, result.pages.length, "eject.done", { path: result.outDir }));

        return { ok: true, printed: true };
      }

      if (choice === "connection") {
        return connection({ prompts, t, root, location });
      }

      return generateInteractively(prompts, t, generate, language, defaultOut, config.warnAboveUnits);
    } catch (error) {
      process.stderr.write(`${formatCliError(error)}\n`);
      prompts.note(t("menu.actionFailed"));

      return { ok: false, printed: true };
    }
  };

  for (;;) {
    const t       = createTranslator(uiLang);
    const cleared = prompts.clear();

    if (cleared) {
      printBanner();
    }

    const status = await readStatus(root, language);
    const line   = renderStatusLine(status, t);

    if (first || cleared) {
      prompts.intro(line);
    } else {
      prompts.note(line);
    }

    first = false;

    const recorded   = await readManifest(path.resolve(root, config.output.manifest));
    const docsDir    = resolveDocsDir({ cwd, root }, sessionDocs, recorded?.docsDir, config.output.dir);

    const defaultOut = recorded?.docsDir ?? config.output.dir;
    const documented = await hasDocs(root, docsDir);
    const noAiCalls  = t("menu.hint.noAiCalls");
    const provider   = status.provider ?? "claude-code";

    const generateHint = 
      knownUnits === undefined
        ? t("menu.hint.usesProvider", { provider })
        : t("menu.hint.usesProviderUnits", {
            provider,
            units: counted(t, knownUnits, "count.unit"),
          });

    const choice = await prompts.select<Choice>({
      message: t("menu.question"),
      options: [
        { value: "scan", label: t("menu.scan"), hint: noAiCalls },
        { value: "generate", label: t("menu.generate"), hint: generateHint },
        {
          value: "eject",
          label: t("menu.eject"),
          hint : documented ? noAiCalls : t("menu.hint.needsDocs"),
        },
        { value: "check", label: t("menu.check"), hint: noAiCalls },
        { value: "connection", label: t("menu.connection") },
        {
          value: "uiLanguage",
          label: t("menu.uiLanguage"),
          hint : t("menu.hint.current", { value: languageLabel(t, uiLang) }),
        },
        {
          value: "docLanguage",
          label: t("menu.docLanguage"),
          hint : t("menu.hint.current", { value: languageLabel(t, language) }),
        },
        { value: "exit", label: t("menu.exit") },
      ],
    });

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
      const codes  = LANGUAGES.map((entry) => entry.code);
      const chosen = await pickLanguage(prompts, t, "prompt.docLanguage", codes, language);

      if (chosen !== undefined && chosen !== language) {
        language = chosen;
        await remember({ lang: chosen });
      }

      continue;
    }

    const outcome = await perform(choice, t, defaultOut);

    if (!outcome.ok) {
      failed = true;
    }

    if (outcome.units !== undefined) {
      knownUnits = outcome.units;
    }

    if (outcome.outDir !== undefined) {
      sessionDocs = outcome.outDir;
    }

    if (cleared && outcome.printed === true) {
      await prompts.pause(t("menu.continue"));
    }
  }
};
