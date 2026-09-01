/**
 * No i18n library: a plain object and one lookup are enough for two
 * catalogues, and they cost nothing to read.
 *
 * Commander's own `--help` output stays English: localising it means fighting
 * the library for very little.
 */
import { en } from "./en.js";
import { es } from "./es.js";
import type { MessageKey } from "./en.js";

export { en } from "./en.js";
export { es } from "./es.js";
export type { MessageKey } from "./en.js";

const CATALOGUES: Readonly<Record<string, Partial<Record<MessageKey, string>>>> = { en, es };

/** The interface languages there is a catalogue for. */
export const UI_LANGUAGES = Object.keys(CATALOGUES);

export const hasCatalogue = (lang: string): boolean => lang in CATALOGUES;

export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

/**
 * Builds the lookup for one interface language. A key missing from the
 * catalogue falls through to English, so a half-translated catalogue degrades
 * one string at a time instead of breaking the screen.
 */
export const createTranslator = (uiLang: string): Translator => {
  const catalogue = CATALOGUES[uiLang] ?? en;

  return (key, params) => {
    const template = catalogue[key] ?? en[key];

    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/g, (whole, name: string) =>
          name in params ? String(params[name]) : whole,
        );
  };
};

/** English, for callers with no resolved interface language yet. */
export const defaultTranslator: Translator = createTranslator("en");
