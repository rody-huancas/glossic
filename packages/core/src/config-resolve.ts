import type { GlossicConfig, GlossicUserConfig } from "@glossic/schema";
import { GlossicConfigSchema } from "@glossic/schema";

/** Where a value came from, most authoritative first. */
export type ConfigOrigin = "flag" | "project" | "preference" | "default";

/** Every key of the resolved config, mapped to where its value came from. */
export type ConfigOrigins = Record<string, ConfigOrigin>;

export interface ConfigSources {
  /** Values from the command line. Only the keys the user actually passed. */
  flags?: GlossicUserConfig | undefined;
  /** Values declared in glossic.config.ts. Only the keys the file set. */
  project?: GlossicUserConfig | undefined;
  /** Values remembered from the interactive menu. */
  preference?: GlossicUserConfig | undefined;
}

export interface ResolvedConfig {
  config: GlossicConfig;
  origins: ConfigOrigins;
}

const ORDER: ReadonlyArray<["flag" | "project" | "preference", keyof ConfigSources]> = [
  ["flag", "flags"],
  ["project", "project"],
  ["preference", "preference"],
];

const isSet = (value: unknown): boolean =>
  value !== undefined && !(typeof value === "string" && value.trim() === "");

/**
 * Applies one precedence chain to every option, not just to `lang`.
 *
 * The sources must carry only the keys they actually declare. A source that
 * arrives with the schema's defaults filled in would silently outrank every
 * source below it — a config file that sets nothing but `adapters` would then
 * also be dictating the language.
 */
export const resolveConfig = (sources: ConfigSources = {}): ResolvedConfig => {
  const merged: Record<string, unknown> = {};
  const origins: ConfigOrigins = {};

  // Lowest priority first, so a higher one simply overwrites.
  for (const [origin, key] of [...ORDER].reverse()) {
    const source = sources[key];
    if (source === undefined) continue;

    for (const [name, value] of Object.entries(source)) {
      if (!isSet(value)) continue;
      merged[name] = value;
      origins[name] = origin;
    }
  }

  const config = GlossicConfigSchema.parse(merged);

  for (const name of Object.keys(config)) {
    origins[name] ??= "default";
  }

  return { config, origins };
};

/**
 * The config keys that decide how files are grouped into units and which of
 * them reach the provider. Reported by `doctor` as one block because they
 * only make sense together.
 */
export const GROUPING_KEYS = [
  "include",
  "exclude",
  "ignoreUnits",
  "excludeFromContent",
  "mergeChildrenInto",
  "minUnitFiles",
  "maxUnitFiles",
] as const;
