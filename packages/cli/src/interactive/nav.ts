import type { Translator } from "../i18n/index.js";
import type { PromptPort, SelectOption } from "../ui/prompts.js";

/**
 * What an action leaves behind: whether it worked, whatever it learned about
 * the project, and whether it wrote something the reader still has to read.
 */
export interface ActionOutcome {
  ok       : boolean;
  units   ?: number | undefined;
  printed ?: boolean | undefined;
}

/**
 * The value a nested selector yields when the reader wants out. Escape and
 * Ctrl+C do the same thing, but not everyone knows that, so every nested
 * selector also offers this as its first entry.
 */
export const BACK = "::back";

/** The way out, first in the list, where a reader looks for it. */
export const backOption = <T>(t: Translator): SelectOption<T> => ({
  value: BACK as unknown as T,
  label: t("nav.back"),
});

/** True when the reader asked to leave the prompt, by picking Back or by cancelling. */
export const leftPrompt = (prompts: PromptPort, value: unknown): boolean =>
  prompts.isCancel(value) || value === BACK || typeof value !== "string";

/** Backing out of a prompt is a choice, not a failure: it never reaches the exit code. */
export const cancelled = (prompts: PromptPort, t: Translator): ActionOutcome => {
  prompts.cancel(t("menu.cancelled"));
  return { ok: true, printed: false };
};
