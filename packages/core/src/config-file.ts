import path from "node:path";

import type { GlossicUserConfig } from "@glossic/schema";
import { GlossicConfigSchema } from "@glossic/schema";
import { createJiti } from "jiti";

import { pathExists } from "./fs-utils.js";
import { toPosix } from "./paths.js";

/** Looked up in this order; the first hit wins. */
export const CONFIG_FILENAMES = [
  "glossic.config.ts",
  "glossic.config.mts",
  "glossic.config.js",
  "glossic.config.mjs",
];

/** Locates the config file in `root`. */
export const findConfigFile = async (root: string): Promise<string | undefined> => {
  for (const filename of CONFIG_FILENAMES) {
    const candidate = path.resolve(root, filename);
    if (await pathExists(candidate)) return toPosix(candidate);
  }
  return undefined;
};

export interface LoadedConfig {
  /** Posix path of the file the values came from. */
  file: string;
  /** Whatever the file exported, validated. Every field is optional. */
  values: GlossicUserConfig;
}

const asUserConfig = (value: unknown): GlossicUserConfig | undefined => {
  if (typeof value !== "object" || value === null) return undefined;

  // The schema fills in defaults, which would drown out the lower-priority
  // sources. Only the keys the file actually set are kept.
  const parsed = GlossicConfigSchema.partial().safeParse(value);
  if (!parsed.success) return undefined;

  const declared = Object.keys(value as Record<string, unknown>);
  return Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => declared.includes(key)),
  ) as GlossicUserConfig;
};

/**
 * Loads `glossic.config.ts` if there is one. The file is TypeScript and may
 * import from the workspace, so it goes through jiti rather than a bare
 * dynamic import, which would need a Node new enough to strip types.
 *
 * A missing, broken or malformed config is not an error: the caller falls back
 * to whatever it would have used anyway.
 */
export const loadProjectConfig = async (root: string): Promise<LoadedConfig | undefined> => {
  const file = await findConfigFile(root);
  if (file === undefined) return undefined;

  try {
    const jiti = createJiti(import.meta.url, { moduleCache: false });
    const loaded = await jiti.import(file, { default: true });

    const values = asUserConfig(loaded);
    return values === undefined ? undefined : { file, values };
  } catch {
    return undefined;
  }
};
