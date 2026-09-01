import { pickLanguage } from "./language.js";
import { LANGUAGES } from "../language.js";
import type { GenerateCliOptions } from "../commands/generate.js";
import type { runGenerate } from "../commands/generate.js";
import type { Translator } from "../i18n/index.js";
import type { PromptPort } from "../ui/prompts.js";

export interface ActionOutcome {
  ok: boolean;
  /** Units the action happened to learn about, for the next menu's hint. */
  units?: number | undefined;
}

export const generateInteractively = async (
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
