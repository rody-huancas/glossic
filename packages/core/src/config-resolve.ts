import type { GlossicConfig, GlossicUserConfig, ListOverride, ListOverrides } from "@glossic/schema";
import { ADDITIVE_LIST_KEYS, applyListOverride, GlossicConfigSchema, LIST_DEFAULTS } from "@glossic/schema";

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
  lists  : ListOverrides;
}

const ORDER: ReadonlyArray<["flag" | "project" | "preference", keyof ConfigSources]> = [
  ["flag", "flags"],
  ["project", "project"],
  ["preference", "preference"],
];

const isSet = (value: unknown): boolean => {
  return value !== undefined && !(typeof value === "string" && value.trim() === "");
}

const entriesFor = (merged: Record<string, unknown>, key: string): readonly string[] | undefined => {
  const value = merged[key];

  return Array.isArray(value) ? (value as string[]) : undefined;
};


/**
 * Merges the sources under one precedence chain (flags, project config, saved
 * preference, schema defaults) and records which one won each key.
 *
 * `exclude`, `ignoreUnits` and `excludeFromContent` are folded into their
 * defaults rather than replacing them, so adding one pattern does not silently
 * cost the other twenty-nine. This is the only place that happens: the schema
 * keeps the raw entries so a caller can still report what a config changed.
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

  const lists = {} as Record<string, ListOverride>;

  for (const key of ADDITIVE_LIST_KEYS) {
    const override = applyListOverride(LIST_DEFAULTS[key], entriesFor(merged, key));

    lists[key]  = override;
    merged[key] = [...override.value];
  }

  const config = GlossicConfigSchema.parse(merged);

  for (const name of Object.keys(config)) {
    origins[name] ??= "default";
  }

  return { config, origins, lists: lists as ListOverrides };
};
