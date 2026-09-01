import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

/** What glossic remembers between runs. Everything is optional. */
export interface Preferences {
  lang  ?: string;
  uiLang?: "en" | "es";
}

export interface PreferencesLocation {
  env     ?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir ?: string;
}

/**
 * The per-user config directory, per platform convention: %APPDATA% on
 * Windows, $XDG_CONFIG_HOME or ~/.config elsewhere. Never inside the scanned
 * project: this is a preference of the person, not of the repository.
 */
export const preferencesPath = (location: PreferencesLocation = {}): string => {
  const env      = location.env ?? process.env;
  const platform = location.platform ?? process.platform;
  const home     = location.homedir ?? os.homedir();

  const base =
    platform === "win32"
      ? (env.APPDATA ?? path.join(home, "AppData", "Roaming"))
      : (env.XDG_CONFIG_HOME ?? path.join(home, ".config"));

  return path.join(base, "glossic", "config.json");
};

/**
 * Reads the saved preferences. A missing file is the normal case on a first
 * run, and a corrupt one is not worth failing over: either way glossic falls
 * back to the next source in the chain.
 */
export const readPreferences = async (location: PreferencesLocation = {}): Promise<Preferences> => {
  try {
    const raw             = await fs.readFile(preferencesPath(location), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};

    const record = parsed as Record<string, unknown>;
    const lang   = record.lang;
    const uiLang = record.uiLang;

    return {
      ...(typeof lang === "string" && lang !== "" ? { lang } : {}),
      ...(uiLang === "en" || uiLang === "es" ? { uiLang } : {}),
    };
  } catch {
    return {};
  }
};

/**
 * Merges and saves. Only ever called when the user changes something from the
 * menu, so an unwritable config directory is reported rather than swallowed.
 */
export const writePreferences = async (
  update: Preferences,
  location: PreferencesLocation = {},
): Promise<string> => {
  const target = preferencesPath(location);
  const merged = { ...(await readPreferences(location)), ...update };

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  return target;
};
