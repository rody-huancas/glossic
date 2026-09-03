import path from "node:path";
import process from "node:process";

import { readManifest } from "@glossic/core";

import { counted } from "../render/index.js";
import { runScan } from "../commands/scan.js";
import { runCheck } from "../commands/check.js";
import { printBanner } from "../ui/banner.js";
import { runGenerate } from "../commands/generate/index.js";
import { pickLanguage } from "./language.js";
import { clackPrompts } from "../ui/prompts.js";
import { runConnection } from "./connection.js";
import { formatCliError } from "../errors.js";
import { hasGeneratedDocs } from "./docs.js";
import { writePreferences } from "../preferences.js";
import { generateInteractively } from "./generate-flow.js";
import { resolveEffectiveConfig } from "../config.js";
import { LANGUAGES, languageLabel } from "../language.js";
import { resolveDocsDir, runEject } from "../commands/eject/index.js";
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

/**
 * The runScan, runGenerate and runCheck slots are the very same entry points
 * the flags go through; `preferences` is injectable so tests neither read nor
 * write the real user config.
 */
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

/**
 * The menu shown by a bare `glossic`. Every branch calls the function the
 * matching flag would have called: this file asks the questions, it never
 * reimplements the work.
 *
 * It is a loop, and every turn starts from a clean screen: the banner, the
 * status line and the menu, with no pile of earlier output above them. An
 * action that printed something holds it on screen until the reader says they
 * are done. Where the screen cannot be wiped -- a pipe, a CI log -- the output
 * accumulates as it always did, and nothing waits for a keypress that will
 * never come.
 *
 * The failure flag and the last unit count are remembered across the session:
 * the first so the exit code can report it, the second so the menu can say
 * what the last scan found without scanning again. An action that throws -- a
 * dead provider, a timeout, a bad path -- is worth reading but not worth
 * ending the session over, so it is reported and the menu is drawn again.
 * Backing out of a prompt is not a failure at all and never reaches the exit
 * code.
 */
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
        const result = await check(".", {});

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

    // Where generate would write if the reader just presses enter: the
    // directory the last run recorded, then the configured one, which itself
    // defaults to docs. Proposing "docs" to someone who generated elsewhere
    // offers to scatter their documentation over two folders.
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
