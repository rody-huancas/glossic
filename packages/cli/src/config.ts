import path from "node:path";

import type { ConfigOrigins, ResolvedConfig } from "@glossic/core";
import { loadProjectConfig, resolveConfig } from "@glossic/core";
import type { GlossicUserConfig } from "@glossic/schema";

import { hasCatalogue } from "./i18n/index.js";
import { detectLanguage } from "./language.js";
import type { PreferencesLocation } from "./preferences.js";
import { readPreferences } from "./preferences.js";

/** `flags` carries only the keys the user actually passed on the command line. */
export interface ConfigRequest {
  root     : string;
  flags   ?: GlossicUserConfig | undefined;
  location?: PreferencesLocation | undefined;
}

export interface EffectiveConfig extends ResolvedConfig {
  file   : string | undefined;
  origins: ConfigOrigins;
}

/**
 * Gathers every source and applies one precedence chain to the whole config:
 * flags, then glossic.config.ts, then the saved preference, then the schema's
 * defaults.
 *
 * The system locale is folded in as a preference rather than a source of its
 * own: it is a default for `lang` that the project's config still outranks. It
 * only reaches `uiLang` when there is a catalogue for it, so a French machine
 * gets an English menu rather than a pile of keys.
 */
export const resolveEffectiveConfig = async (request: ConfigRequest): Promise<EffectiveConfig> => {
  const root = path.resolve(request.root);

  const [project, preferences] = await Promise.all([
    loadProjectConfig(root),
    readPreferences(request.location ?? {}),
  ]);

  const system = detectLanguage();

  const preference: GlossicUserConfig = {
    ...preferences,
    lang  : preferences.lang ?? system,
    uiLang: preferences.uiLang ?? (hasCatalogue(system) ? (system as "en" | "es") : "en"),
  };

  const resolved = resolveConfig({
    ...(request.flags === undefined ? {} : { flags: request.flags }),
    ...(project === undefined ? {} : { project: project.values }),
    preference,
  });

  return { ...resolved, file: project?.file };
};

/** Turns `--flag` values into the config keys they stand for. */
export const flagsToConfig = (flags: {
  lang       ?: string | undefined;
  uiLang     ?: string | undefined;
  provider   ?: string | undefined;
  concurrency?: number | undefined;
  model      ?: string | undefined;
}): GlossicUserConfig => ({
  ...(flags.lang === undefined ? {} : { lang: flags.lang }),
  ...(flags.uiLang === undefined ? {} : { uiLang: flags.uiLang as "en" | "es" }),
  ...(flags.provider === undefined ? {} : { provider: flags.provider }),
  ...(flags.concurrency === undefined ? {} : { concurrency: flags.concurrency }),
  ...(flags.model === undefined ? {} : { model: flags.model }),
});
