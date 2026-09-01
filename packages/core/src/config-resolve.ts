import type { GlossicConfig, GlossicUserConfig } from "@glossic/schema";
import { GlossicConfigSchema } from "@glossic/schema";

/** Which source decided one option's value; `glossic doctor` prints it. */
export type ConfigOrigin = "flag" | "project" | "preference" | "default";

export type ConfigOrigins = Record<string, ConfigOrigin>;

export interface ConfigSources {
  flags     ?: GlossicUserConfig | undefined;
  project   ?: GlossicUserConfig | undefined;
  preference?: GlossicUserConfig | undefined;
}

export interface ResolvedConfig {
  config : GlossicConfig;
  origins: ConfigOrigins;
}

const ORDER: ReadonlyArray<["flag" | "project" | "preference", keyof ConfigSources]> = [
  ["flag", "flags"],
  ["project", "project"],
  ["preference", "preference"],
];

const isSet = (value: unknown): boolean => {
  return value !== undefined && !(typeof value === "string" && value.trim() === "");
}


/**
 * Merges the sources under one precedence chain (flags, project config, saved
 * preference, schema defaults) and records which one won each key.
 */
export const resolveConfig = (sources: ConfigSources = {}): ResolvedConfig => {
  const merged : Record<string, unknown> = {};
  const origins: ConfigOrigins           = {};

  for (const [origin, key] of [...ORDER].reverse()) {
    const source = sources[key];

    if (source === undefined) continue;

    for (const [name, value] of Object.entries(source)) {
      if (!isSet(value)) continue;

      merged[name]  = value;
      origins[name] = origin;
    }
  }

  const config = GlossicConfigSchema.parse(merged);

  for (const name of Object.keys(config)) {
    origins[name] ??= "default";
  }

  return { config, origins };
};


/** The options that change how files become units, and so invalidate a scan. */
export const GROUPING_KEYS = [
  "include",
  "exclude",
  "ignoreUnits",
  "excludeFromContent",
  "mergeChildrenInto",
  "minUnitFiles",
  "maxUnitFiles",
] as const;
