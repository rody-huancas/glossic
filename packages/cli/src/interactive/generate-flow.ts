import { LANGUAGES } from "../language.js";
import { cancelled } from "./nav.js";
import { pickLanguage } from "./language.js";
import type { Translator } from "../i18n/index.js";
import type { PromptPort } from "../ui/prompts.js";
import type { runGenerate } from "../commands/generate/index.js";
import type { ActionOutcome } from "./nav.js";
import type { GenerateCliOptions, QuotaChoice } from "../commands/generate/index.js";

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
  prompts   : PromptPort,
  t         : Translator,
  generate  : typeof runGenerate,
  resolved  : string,
  defaultOut: string,
  warnAbove : number,
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

  const plan    = await generate(".", { ...options, dryRun: true });
  const units   = plan.plan.length;
  const pending = plan.plan.filter((entry) => entry.regenerate).length;

  // A plan over the warning size asks a better question of its own once the run
  // starts -- all at once, one project at a time, or not at all -- so confirming
  // here first would be that same question with an answer missing.
  if (pending <= warnAbove) {
    const confirmed = await prompts.confirm({
      message     : t("prompt.confirmGenerate", { units: pending, tokens: Math.round(plan.estimatedTokens / 1000) }),
      initialValue: true,
    });

    if (prompts.isCancel(confirmed) || confirmed !== true) {
      return { ...cancelled(prompts, t), units };
    }
  }

  // "Back to the menu" is an answer about where to go next, so it goes there:
  // the report is not held on screen waiting for a keypress first.
  let quota: QuotaChoice | undefined;

  const result = await generate(".", options, {
    prompts,
    menu         : true,
    onQuotaChoice: (choice) => {
      quota = choice;
    },
  });

  prompts.outro(t("prompt.outro", { generated: result.generated, failed: result.failures.length }));

  return {
    ok     : result.failures.length === 0,
    units,
    printed: quota !== "menu",
    ...(answer === "" ? {} : { outDir: answer }),
  };
};
