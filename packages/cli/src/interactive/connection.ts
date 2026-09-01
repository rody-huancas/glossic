import process from "node:process";

import { createAnthropicProvider } from "@glossic/provider-anthropic";
import { claudeCodeProvider } from "@glossic/provider-claude-code";

import { collectDoctorReport, renderDoctorSummary } from "../commands/doctor.js";
import { maskSecret, readPreferences, writePreferences } from "../preferences.js";
import { builtinAdapters, builtinProviders } from "../registries.js";
import { backOption, leftPrompt } from "./nav.js";
import type { Translator } from "../i18n/index.js";
import type { PromptPort } from "../ui/prompts.js";
import type { ActionOutcome, BACK } from "./nav.js";
import type { PreferencesLocation } from "../preferences.js";

type Entry = typeof BACK | "status" | "claudeCode" | "anthropic" | "forget";

/**
 * Everything the submenu needs from the outside, so a test can drive it
 * without a terminal, a config directory or a network.
 */
export interface ConnectionDeps {
  prompts         : PromptPort;
  t               : Translator;
  root            : string;
  location        : PreferencesLocation;
  readPreferences ?: typeof readPreferences;
  writePreferences?: typeof writePreferences;
  verifyClaudeCode?: () => Promise<boolean>;
  verifyApiKey    ?: (apiKey: string) => Promise<boolean>;
}

/** A key is good when the provider built around it reports itself usable. */
const defaultVerifyApiKey = async (apiKey: string): Promise<boolean> =>
  createAnthropicProvider({ apiKey }).available().catch(() => false);

const defaultVerifyClaudeCode = async (): Promise<boolean> =>
  claudeCodeProvider.available().catch(() => false);

/**
 * Forces claude-code and saves it, but only once the CLI has actually
 * answered: saving a provider that cannot run would strand the next run on a
 * preference that outranks auto-detection.
 */
const useClaudeCode = async (deps: ConnectionDeps): Promise<boolean> => {
  const { prompts, t } = deps;
  const save           = deps.writePreferences ?? writePreferences;
  const verify         = deps.verifyClaudeCode ?? defaultVerifyClaudeCode;

  prompts.note(t("connection.verifying"));

  if (!(await verify())) {
    prompts.note(t("connection.claudeCodeMissing"));
    return false;
  }

  await save({ provider: "claude-code" }, deps.location);
  prompts.note(t("connection.claudeCodeSaved"));

  return true;
};

/**
 * Asks for a key without echoing it, checks it, and only then writes it. A key
 * that does not work is never saved, and it is never printed back in full.
 */
const useAnthropicKey = async (deps: ConnectionDeps): Promise<boolean> => {
  const { prompts, t } = deps;
  const save           = deps.writePreferences ?? writePreferences;
  const verify         = deps.verifyApiKey ?? defaultVerifyApiKey;

  const entered = await prompts.password({ message: t("connection.promptKey") });

  if (prompts.isCancel(entered) || typeof entered !== "string" || entered.trim() === "") {
    return false;
  }

  const apiKey = entered.trim();

  prompts.note(t("connection.verifying"));

  if (!(await verify(apiKey))) {
    prompts.note(t("connection.keyInvalid"));
    return false;
  }

  await save({ provider: "anthropic", anthropicApiKey: apiKey }, deps.location);
  prompts.note(t("connection.keySaved", { masked: maskSecret(apiKey) }));

  return true;
};

/**
 * Drops the key and the provider preference together: keeping "anthropic"
 * pinned with no key to run it would leave the next run with no provider at
 * all, when auto-detection could have found one.
 */
const forgetApiKey = async (deps: ConnectionDeps): Promise<boolean> => {
  const { prompts, t } = deps;
  const save           = deps.writePreferences ?? writePreferences;

  await save({ anthropicApiKey: undefined, provider: undefined }, deps.location);
  prompts.note(t("connection.keyRemoved"));

  return true;
};

/** The doctor report, trimmed to what the menu needs. */
const showStatus = async (deps: ConnectionDeps): Promise<boolean> => {
  const report = await collectDoctorReport({
    root     : deps.root,
    providers: builtinProviders,
    adapters : builtinAdapters,
  });

  process.stdout.write(renderDoctorSummary(report, deps.t));

  return report.exitCode === 0;
};

/**
 * The Connection submenu: see what glossic found, or force a provider and make
 * the choice stick. Auto-detection is untouched by opening this menu; it only
 * stops applying once something here is saved.
 *
 * It is its own loop, so picking an entry does not throw the reader back to
 * the main menu, and every entry that prints waits before redrawing.
 */
export const runConnection = async (deps: ConnectionDeps): Promise<ActionOutcome> => {
  const { prompts, t } = deps;
  const read           = deps.readPreferences ?? readPreferences;

  let failed = false;

  for (;;) {
    const saved   = await read(deps.location);
    const cleared = prompts.clear();

    const options = [
      backOption<Entry>(t),
      {
        value: "status" as const,
        label: t("connection.status"),
        hint : saved.provider === undefined
          ? t("connection.hint.auto")
          : t("connection.hint.saved", { provider: saved.provider }),
      },
      { value: "claudeCode" as const, label: t("connection.useClaudeCode") },
      {
        value: "anthropic" as const,
        label: t("connection.useAnthropic"),
        ...(saved.anthropicApiKey === undefined
          ? {}
          : { hint: t("connection.hint.key", { masked: maskSecret(saved.anthropicApiKey) }) }),
      },
      ...(saved.anthropicApiKey === undefined
        ? []
        : [{ value: "forget" as const, label: t("connection.forgetKey") }]),
    ];

    const choice = await prompts.select<Entry>({ message: t("connection.question"), options });

    if (leftPrompt(prompts, choice)) {
      return { ok: !failed, printed: false };
    }

    const ok =
      choice === "status"     ? await showStatus(deps)
      : choice === "claudeCode" ? await useClaudeCode(deps)
      : choice === "anthropic"  ? await useAnthropicKey(deps)
      : await forgetApiKey(deps);

    // Only the status report can fail in a way the exit code should hear
    // about; declining to save a provider is a choice, not a failure.
    if (choice === "status" && !ok) {
      failed = true;
    }

    if (cleared) {
      await prompts.pause(t("menu.continue"));
    }
  }
};
