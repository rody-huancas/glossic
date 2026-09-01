import path from "node:path";
import process from "node:process";

import { probeProviders, resolveWorkspace } from "@glossic/core";

import { runCheck } from "./commands/check.js";
import { collectDoctorReport, renderDoctorReport } from "./commands/doctor.js";
import type { GenerateCliOptions } from "./commands/generate.js";
import { runGenerate } from "./commands/generate.js";
import { runScan } from "./commands/scan.js";
import { LANGUAGES, languageName, resolveDocumentationLanguage } from "./language.js";
import type { PreferencesLocation } from "./preferences.js";
import { writePreferences } from "./preferences.js";
import { builtinAdapters, builtinProviders } from "./registries.js";
import type { PromptPort } from "./ui/prompts.js";
import { clackPrompts } from "./ui/prompts.js";
import { accent, dim } from "./ui/theme.js";

type Choice = "scan" | "generate" | "check" | "doctor" | "language" | "exit";

export interface InteractiveDeps {
  prompts?: PromptPort;
  /** The very same entry points the flags go through. */
  runScan?: typeof runScan;
  runGenerate?: typeof runGenerate;
  runCheck?: typeof runCheck;
  cwd?: string;
  /** Injectable so tests neither read nor write the real user config. */
  preferences?: PreferencesLocation;
  resolveLanguage?: typeof resolveDocumentationLanguage;
  writePreferences?: typeof writePreferences;
}

export interface StatusLine {
  project: string;
  provider: string | undefined;
  language: string;
}

/**
 * `riqsi-frontend · claude-code · docs in Spanish`
 *
 * The language is spelled out as the documentation's, not the interface's:
 * "· Spanish" on its own read as though the menu had been translated.
 */
export const renderStatusLine = (status: StatusLine): string =>
  [
    accent(status.project),
    status.provider ?? dim("no provider"),
    dim(`docs in ${languageName(status.language)}`),
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

const cancelled = (prompts: PromptPort): number => {
  prompts.cancel("Cancelled.");
  return 0;
};

/** The language picker, preselected on whatever is in force right now. */
const pickLanguage = async (prompts: PromptPort, current: string): Promise<string | undefined> => {
  const chosen = await prompts.select<string>({
    message: "Which language should the documentation be written in?",
    options: LANGUAGES.map((entry) => ({
      value: entry.code,
      label: entry.name,
      ...(entry.code === current ? { hint: "current" } : {}),
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
  const resolve = deps.resolveLanguage ?? resolveDocumentationLanguage;
  const save = deps.writePreferences ?? writePreferences;
  const location = deps.preferences ?? {};

  const root = path.resolve(cwd);
  let language = (await resolve({ root, location })).language;
  let first = true;

  // Choosing a language comes back here, so the status line is redrawn with
  // the new value instead of going stale until the next run.
  for (;;) {
    const status = await readStatus(root, language);
    const line = renderStatusLine(status);

    if (first) prompts.intro(line);
    else prompts.note(line);
    first = false;

    // "free" read as a pricing tier. What it means is that nothing calls a model.
    const noAiCalls = "structure only, no AI calls";

    const choice = await prompts.select<Choice>({
      message: "What would you like to do?",
      options: [
        { value: "scan", label: "Scan the project", hint: noAiCalls },
        {
          value: "generate",
          label: "Generate documentation",
          hint: `uses your ${status.provider ?? "claude-code"} session`,
        },
        { value: "check", label: "Check if docs are current", hint: noAiCalls },
        { value: "doctor", label: "Connection status" },
        {
          value: "language",
          label: "Documentation language",
          hint: `currently: ${languageName(language)}`,
        },
        { value: "exit", label: "Exit" },
      ],
    });

    if (prompts.isCancel(choice) || choice === "exit") {
      prompts.cancel("Bye.");
      return 0;
    }

    if (choice === "language") {
      const chosen = await pickLanguage(prompts, language);
      if (chosen !== undefined && chosen !== language) {
        language = chosen;
        await save({ lang: chosen }, location);
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
      process.stdout.write(renderDoctorReport(report));
      return report.exitCode;
    }

    return generateInteractively(prompts, generate, language);
  }
};

const generateInteractively = async (
  prompts: PromptPort,
  generate: typeof runGenerate,
  resolved: string,
): Promise<number> => {
  // Already resolved from the chain, so this is an Enter rather than a
  // decision the user has to make again.
  const language = await pickLanguage(prompts, resolved);
  if (language === undefined) return cancelled(prompts);

  const out = await prompts.text({
    message: "Where should the documentation go?",
    placeholder: "./docs",
    defaultValue: "./docs",
  });
  if (prompts.isCancel(out) || typeof out !== "string") return cancelled(prompts);

  const options: GenerateCliOptions = {
    lang: language,
    out: out === "" ? "./docs" : out,
  };

  // The plan and the estimate come from the real dry run, not a guess.
  const plan = await generate(".", { ...options, dryRun: true });

  const confirmed = await prompts.confirm({
    message: `Generate ${plan.plan.filter((entry) => entry.regenerate).length} units (~${Math.round(
      plan.estimatedTokens / 1000,
    )}k input tokens)?`,
    initialValue: true,
  });
  if (prompts.isCancel(confirmed) || confirmed !== true) return cancelled(prompts);

  const result = await generate(".", options);
  prompts.outro(`${result.generated} generated · ${result.failures.length} failed`);

  return result.failures.length > 0 ? 1 : 0;
};
