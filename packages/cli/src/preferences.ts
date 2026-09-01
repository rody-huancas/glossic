import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

/** What glossic remembers between runs. Everything is optional. */
export interface Preferences {
  lang           ?: string;
  uiLang         ?: "en" | "es";
  provider       ?: string;
  anthropicApiKey?: string;
}

/**
 * A change to the saved preferences. Unlike `Preferences` it accepts an
 * explicit undefined, which is how the menu asks for a key to be forgotten
 * rather than left alone.
 */
export interface PreferencesUpdate {
  lang           ?: string | undefined;
  uiLang         ?: "en" | "es" | undefined;
  provider       ?: string | undefined;
  anthropicApiKey?: string | undefined;
}

/** Overrides for where the preferences file lives, so a test never touches the real one. */
export interface PreferencesLocation {
  env     ?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  homedir ?: string;
}

/** The file holds a secret, so nobody but its owner may read it. */
const SECRET_MODE = 0o600;

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
 * All but the last four characters, for showing a saved key without leaking
 * it. The mask is a fixed width so it does not give the length away either.
 */
export const maskSecret = (value: string): string =>
  value.length <= 4 ? "•".repeat(8) : `${"•".repeat(8)}${value.slice(-4)}`;

const asText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

/**
 * Reads the saved preferences. A missing file is the normal case on a first
 * run, and a corrupt one is not worth failing over: either way glossic falls
 * back to the next source in the chain.
 */
export const readPreferences = async (location: PreferencesLocation = {}): Promise<Preferences> => {
  try {
    const raw             = await fs.readFile(preferencesPath(location), "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    const record   = parsed as Record<string, unknown>;
    const lang     = asText(record.lang);
    const uiLang   = record.uiLang;
    const provider = asText(record.provider);
    const apiKey   = asText(record.anthropicApiKey);

    return {
      ...(lang === undefined ? {} : { lang }),
      ...(uiLang === "en" || uiLang === "es" ? { uiLang } : {}),
      ...(provider === undefined ? {} : { provider }),
      ...(apiKey === undefined ? {} : { anthropicApiKey: apiKey }),
    };
  } catch {
    return {};
  }
};

/**
 * Merges and saves. Only ever called when the user changes something from the
 * menu, so an unwritable config directory is reported rather than swallowed.
 *
 * A key explicitly set to undefined is dropped rather than merged, which is
 * how the menu forgets a saved API key.
 */
export const writePreferences = async (update: PreferencesUpdate, location: PreferencesLocation = {}): Promise<string> => {
  const target = preferencesPath(location);
  const merged: Record<string, unknown> = { ...(await readPreferences(location)), ...update };

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) {
      delete merged[key];
    }
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(merged, null, 2)}\n`, { encoding: "utf8", mode: SECRET_MODE });

  // writeFile only applies the mode when it creates the file, so an existing
  // one keeps whatever it had until it is told otherwise. Windows has no such
  // bits to set, and refusing to save there would be worse than not setting them.
  if ((location.platform ?? process.platform) !== "win32") {
    await fs.chmod(target, SECRET_MODE);
  }

  return target;
};
