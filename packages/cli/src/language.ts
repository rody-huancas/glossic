export const DEFAULT_LANGUAGE = "en";

/** Where a locale can come from, most specific first. */
const LOCALE_VARIABLES = ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"] as const;

export interface LanguageSource {
  env?: NodeJS.ProcessEnv;
  /**
   * The runtime's locale. Passing it explicitly — even as undefined — stops
   * the lookup from reaching the real machine, which is what tests need.
   */
  locale?: string | undefined;
}

const resolvedLocale = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
};

/**
 * The ISO 639-1 code of the system language, or English when there is nothing
 * to go on. POSIX locales win over the runtime's, because a user who exported
 * LANG meant it.
 */
export const detectLanguage = (source: LanguageSource = {}): string => {
  const env = source.env ?? process.env;

  const fromEnv = LOCALE_VARIABLES.map((name) => env[name]).find(
    (value) => value !== undefined && value !== "" && !/^(C|POSIX)$/i.test(value),
  );

  const runtime = "locale" in source ? source.locale : resolvedLocale();
  const candidate = fromEnv ?? runtime;
  const code = candidate?.split(/[._@-]/)[0]?.toLowerCase();

  return code !== undefined && /^[a-z]{2}$/.test(code) ? code : DEFAULT_LANGUAGE;
};

/** Human name of a language code, for the status line and the prompts. */
export const languageName = (code: string): string =>
  ({ en: "English", es: "Spanish" })[code] ?? code;
