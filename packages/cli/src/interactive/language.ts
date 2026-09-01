import { languageLabel } from "../language.js";
import { backOption, leftPrompt } from "./nav.js";
import type { MessageKey, Translator } from "../i18n/index.js";
import type { PromptPort } from "../ui/prompts.js";

/**
 * A picker over language codes, preselected on the one in force. Undefined
 * means the reader backed out, whether by picking Back or by cancelling.
 */
export const pickLanguage = async (
  prompts: PromptPort,
  t      : Translator,
  message: MessageKey,
  codes  : readonly string[],
  current: string,
): Promise<string | undefined> => {
  const chosen = await prompts.select<string>({
    message: t(message),
    options: [
      backOption<string>(t),
      ...codes.map((code) => ({
        value: code,
        label: languageLabel(t, code),
        ...(code === current ? { hint: t("prompt.hint.current") } : {}),
      })),
    ],
    initialValue: current,
  });

  return leftPrompt(prompts, chosen) ? undefined : (chosen as string);
};
