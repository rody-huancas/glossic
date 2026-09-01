import { resolveEffectiveConfig } from "./config.js";
import type { PreferencesLocation } from "./preferences.js";

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

/** The languages the menu offers. Anything else still works through --lang. */
export const LANGUAGES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
];

const NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  LANGUAGES.map((entry) => [entry.code, entry.name]),
);

/** Human name of a language code, for the status line and the prompts. */
export const languageName = (code: string): string => NAMES[code] ?? code;

/** Where the documentation language came from, most authoritative first. */
export type LanguageOrigin = "flag" | "project" | "preference" | "system" | "default";

export interface LanguageInputs {
  /** --lang on the command line. */
  flag?: string | undefined;
  /** `lang` in the project's glossic.config.ts. */
  project?: string | undefined;
  /** The user's saved choice. */
  preference?: string | undefined;
  /** The system locale. */
  system?: string | undefined;
}

export interface ResolvedLanguage {
  language: string;
  origin: LanguageOrigin;
}

const usable = (value: string | undefined): value is string =>
  value !== undefined && value.trim() !== "";

/**
 * The precedence chain: an explicit flag beats the project's config, which
 * beats what this user chose once, which beats the machine's locale.
 */
export const resolveLanguage = (inputs: LanguageInputs): ResolvedLanguage => {
  const chain: ReadonlyArray<[LanguageOrigin, string | undefined]> = [
    ["flag", inputs.flag],
    ["project", inputs.project],
    ["preference", inputs.preference],
    ["system", inputs.system],
  ];

  for (const [origin, value] of chain) {
    if (usable(value)) return { language: value.trim(), origin };
  }

  return { language: DEFAULT_LANGUAGE, origin: "default" };
};

export interface LanguageContext {
  /** Absolute path of the scanned workspace. */
  root: string;
  flag?: string | undefined;
  location?: PreferencesLocation;
}

/**
 * The documentation language alone, for callers that need nothing else.
 * Delegates to the one config resolver so the menu can never disagree with
 * the command it is about to run.
 */
export const resolveDocumentationLanguage = async (
  context: LanguageContext,
): Promise<ResolvedLanguage> => {
  const { config, origins } = await resolveEffectiveConfig({
    root: context.root,
    ...(context.flag === undefined ? {} : { flags: { lang: context.flag } }),
    ...(context.location === undefined ? {} : { location: context.location }),
  });

  const origin = origins.lang ?? "default";
  return {
    language: config.lang,
    origin: origin === "preference" && context.flag === undefined ? "preference" : origin,
  };
};
