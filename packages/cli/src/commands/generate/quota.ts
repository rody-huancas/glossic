import type { GenerateResult } from "@glossic/core";

import type { Translator } from "../../i18n/index.js";
import type { PromptPort, SelectOption } from "../../ui/prompts.js";

/** What to do with a run the provider cut short. */
export type QuotaChoice = "stop" | "retry" | "menu";

/**
 * Asked once a run stopped on a provider with nothing left to give. The count
 * is of the whole plan, cache included, because "109 of 147" is what the reader
 * wants to know, not how many of them this particular run paid for.
 *
 * The note saying the work is cached comes first: it is what makes finishing
 * here a decision rather than a loss. `fromMenu` is what decides whether going
 * back to one is worth offering.
 */
export const askAfterQuota = async (prompts: PromptPort, t: Translator, result: GenerateResult, fromMenu: boolean): Promise<QuotaChoice> => {
  prompts.note(t("prompt.quotaCached"));

  const options: SelectOption<QuotaChoice>[] = [
    { value: "stop", label: t("prompt.quotaStop") },
    { value: "retry", label: t("prompt.quotaRetry") },
  ];

  if (fromMenu) {
    options.push({ value: "menu", label: t("prompt.quotaMenu") });
  }

  const answer = await prompts.select<QuotaChoice>({
    message: t("prompt.quotaSpent", {
      generated: result.generated + result.fromCache,
      total    : result.plan.length,
    }),
    options,
    initialValue: "stop",
  });

  return prompts.isCancel(answer) || typeof answer !== "string" ? "stop" : answer;
};
