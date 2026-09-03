import type { PlanProject, PlanReview } from "@glossic/core";

import { counted, formatTokens } from "../../render/index.js";
import { BACK, leftPrompt } from "../../interactive/nav.js";
import type { Translator } from "../../i18n/index.js";
import type { PromptPort, SelectOption } from "../../ui/prompts.js";

/** What the reader wants done with a plan big enough to be worth asking about. */
export type PlanScope = "all" | "by-project" | "cancel";

/**
 * Offered when the plan is over the configured size. The middle option is the
 * same work one project per run, with the cache keeping each finished project
 * out of the next one.
 */
export const askPlanScope = async (prompts: PromptPort, t: Translator): Promise<PlanScope> => {
  const answer = await prompts.select<PlanScope>({
    message: t("prompt.planScope"),
    options: [
      { value: "all", label: t("prompt.planAll") },
      { value: "by-project", label: t("prompt.planByProject") },
      { value: "cancel", label: t("prompt.planCancel") },
    ],
    initialValue: "by-project",
  });

  return leftPrompt(prompts, answer) ? "cancel" : (answer as PlanScope);
};

/** A project's line in the picker: what it still costs, or that it is done. */
const projectOption = (project: PlanProject, t: Translator): SelectOption<string> => ({
  value: project.id,
  label: project.name,
  hint : project.pending === 0
    ? t("prompt.projectDone")
    : t("prompt.projectPending", {
        pending: counted(t, project.pending, "count.pending"),
        tokens : formatTokens(project.estimatedTokens),
      }),
});

/**
 * The project to generate next, or undefined to stop. The list is rebuilt from
 * the plan on every pass, so a project finished a moment ago comes back marked
 * done rather than having to be remembered here.
 */
export const pickProject = async (prompts: PromptPort, t: Translator, review: PlanReview): Promise<string | undefined> => {
  const pending = review.projects.filter((project) => project.pending > 0);

  if (pending.length === 0) {
    return undefined;
  }

  const answer = await prompts.select<string>({
    message: t("prompt.pickProject"),
    options: [
      ...review.projects.map((project) => projectOption(project, t)),
      { value: BACK, label: t("prompt.planFinish") },
    ],
    initialValue: pending[0]?.id,
  });

  return leftPrompt(prompts, answer) ? undefined : (answer as string);
};
