import type { GlossicConfig, GlossicUserConfig } from "@glossic/schema";
import { GlossicConfigSchema } from "@glossic/schema";

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


export const GROUPING_KEYS = [
  "include",
  "exclude",
  "ignoreUnits",
  "excludeFromContent",
  "mergeChildrenInto",
  "minUnitFiles",
  "maxUnitFiles",
] as const;
