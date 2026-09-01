import type { MessageKey, Translator } from "../i18n/index.js";
import type { PromptPort } from "../ui/prompts.js";

export /** The language's own name, in the interface language. */
const languageLabel = (t: Translator, code: string): string => {
  const key = `language.${code}` as MessageKey;
  const name = t(key);
  return name === key ? code : name;
};

export /** A picker over language codes, preselected on the one in force. */
const pickLanguage = async (
  prompts: PromptPort,
  t: Translator,
  message: MessageKey,
  codes: readonly string[],
  current: string,
): Promise<string | undefined> => {
  const chosen = await prompts.select<string>({
    message: t(message),
    options: codes.map((code) => ({
      value: code,
      label: languageLabel(t, code),
      ...(code === current ? { hint: t("prompt.hint.current") } : {}),
    })),
    initialValue: current,
  });

  return prompts.isCancel(chosen) || typeof chosen !== "string" ? undefined : chosen;
};
