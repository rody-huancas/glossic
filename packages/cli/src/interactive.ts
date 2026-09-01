import path from "node:path";
import process from "node:process";

import { probeProviders, resolveWorkspace } from "@glossic/core";
import { runCheck } from "./commands/check.js";
import { collectDoctorReport, renderDoctorReport } from "./commands/doctor.js";
import type { GenerateCliOptions } from "./commands/generate.js";
import { runGenerate } from "./commands/generate.js";
import { runScan } from "./commands/scan.js";
import { detectLanguage, languageName } from "./language.js";
import { builtinAdapters, builtinProviders } from "./registries.js";
import type { PromptPort } from "./ui/prompts.js";
import { clackPrompts } from "./ui/prompts.js";
import { accent, dim } from "./ui/theme.js";

type Choice = "scan" | "generate" | "check" | "doctor" | "exit";

export interface InteractiveDeps {
  prompts?: PromptPort;
  /** The very same entry points the flags go through. */
  runScan?: typeof runScan;
  runGenerate?: typeof runGenerate;
  runCheck?: typeof runCheck;
  cwd?: string;
  detectLanguage?: typeof detectLanguage;
}

export interface StatusLine {
  project: string;
  provider: string | undefined;
  language: string;
}

/** `riqsi · claude-code connected · Spanish` */
export const renderStatusLine = (status: StatusLine): string =>
  [
    accent(status.project),
    status.provider === undefined ? dim("no provider") : `${status.provider} ${dim("connected")}`,
    dim(languageName(status.language)),
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
  const language = (deps.detectLanguage ?? detectLanguage)();

  const status = await readStatus(cwd, language);

  prompts.intro(renderStatusLine(status));

  const choice = await prompts.select<Choice>({
    message: "What would you like to do?",
    options: [
      { value: "scan", label: "Scan the project", hint: "free" },
      { value: "generate", label: "Generate documentation" },
      { value: "check", label: "Check whether the docs are current" },
      { value: "doctor", label: "Connection status" },
      { value: "exit", label: "Exit" },
    ],
  });

  if (prompts.isCancel(choice) || choice === "exit") {
    prompts.cancel("Bye.");
    return 0;
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
      root: path.resolve(cwd),
      providers: builtinProviders,
      adapters: builtinAdapters,
    });
    process.stdout.write(renderDoctorReport(report));
    return report.exitCode;
  }

  return generateInteractively(prompts, generate, language);
};

const generateInteractively = async (
  prompts: PromptPort,
  generate: typeof runGenerate,
  detected: string,
): Promise<number> => {
  const language = await prompts.select<string>({
    message: "Which language should the documentation be written in?",
    options: [
      { value: "es", label: "Spanish", hint: detected === "es" ? "detected" : undefined },
      { value: "en", label: "English", hint: detected === "en" ? "detected" : undefined },
    ],
  });
  if (prompts.isCancel(language) || typeof language !== "string") return cancelled(prompts);

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

const cancelled = (prompts: PromptPort): number => {
  prompts.cancel("Cancelled.");
  return 0;
};
