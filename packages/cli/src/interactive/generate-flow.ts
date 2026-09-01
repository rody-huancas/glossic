import { LANGUAGES } from "../language.js";
import { pickLanguage } from "./language.js";
import type { Translator } from "../i18n/index.js";
import type { PromptPort } from "../ui/prompts.js";
import type { runGenerate } from "../commands/generate.js";
import type { GenerateCliOptions } from "../commands/generate.js";

/** `units` is whatever the action happened to learn, for the next menu's hint. */
export interface ActionOutcome {
  ok    : boolean;
  units?: number | undefined;
}

/**
 * The language is already resolved from the chain, so its prompt is an Enter
 * rather than a decision the user has to make again, and the out-dir
 * placeholder names the directory the config already points at: an empty
 * answer accepts it. Substituting "./docs" there would quietly override a
 * project that configured somewhere else.
 *
 * The plan and the estimate shown before confirming come from a real dry run,
 * not a guess.
 */
export const generateInteractively = async (
  prompts: PromptPort,
  t: Translator,
  generate: typeof runGenerate,
  resolved: string,
  defaultOut: string,
): Promise<ActionOutcome> => {

  const codes    = LANGUAGES.map((entry) => entry.code);
  const language = await pickLanguage(prompts, t, "prompt.docLanguage", codes, resolved);

  if (language === undefined) {
    return cancelled(prompts, t);
  }

  const out = await prompts.text({
    message    : t("prompt.outDir"),
    placeholder: defaultOut,
  });

  if (prompts.isCancel(out) || typeof out !== "string") {
    return cancelled(prompts, t);
  }

  const answer = out.trim();
  const options: GenerateCliOptions = {
    lang: language,
    ...(answer === "" ? {} : { out: answer }),
  };

  const plan  = await generate(".", { ...options, dryRun: true });
  const units = plan.plan.length;

  const confirmed = await prompts.confirm({
    message: t("prompt.confirmGenerate", {
      units : plan.plan.filter((entry) => entry.regenerate).length,
      tokens: Math.round(plan.estimatedTokens / 1000),
    }),
    initialValue: true,
  });

  if (prompts.isCancel(confirmed) || confirmed !== true) {
    return { ...cancelled(prompts, t), units };
  }

  const result = await generate(".", options);
  prompts.outro(t("prompt.outro", { generated: result.generated, failed: result.failures.length }));

  return { ok: result.failures.length === 0, units };
};

/** Backing out of a prompt is a choice, not a failure. */
const cancelled = (prompts: PromptPort, t: Translator): ActionOutcome => {
  prompts.cancel(t("menu.cancelled"));
  return { ok: true };
};
