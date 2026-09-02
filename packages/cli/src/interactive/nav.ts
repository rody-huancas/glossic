import type { Translator } from "../i18n/index.js";
import type { PromptPort, SelectOption } from "../ui/prompts.js";

export interface ActionOutcome {
  ok       : boolean;
  units   ?: number | undefined;
  printed ?: boolean | undefined;
  outDir  ?: string | undefined;
}


export const BACK = "::back";


export const backOption = <T>(t: Translator): SelectOption<T> => ({
  value: BACK as unknown as T,
  label: t("nav.back"),
});


export const leftPrompt = (prompts: PromptPort, value: unknown): boolean => {
  return prompts.isCancel(value) || value === BACK || typeof value !== "string";
}


export const cancelled = (prompts: PromptPort, t: Translator): ActionOutcome => {
  prompts.cancel(t("menu.cancelled"));
  return { ok: true, printed: false };
};
