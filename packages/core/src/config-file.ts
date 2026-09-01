import path from "node:path";

import { createJiti } from "jiti";
import { GlossicConfigSchema } from "@glossic/schema";
import type { GlossicUserConfig } from "@glossic/schema";

import { toPosix } from "./paths.js";
import { pathExists } from "./fs-utils.js";

export const CONFIG_FILENAMES = [
  "glossic.config.ts",
  "glossic.config.mts",
  "glossic.config.js",
  "glossic.config.mjs",
];


export const findConfigFile = async (root: string): Promise<string | undefined> => {
  for (const filename of CONFIG_FILENAMES) {
    const candidate = path.resolve(root, filename);
    if (await pathExists(candidate)) {
      return toPosix(candidate);
    }
  }
  
  return undefined;
};

export interface LoadedConfig {
  file  : string;
  values: GlossicUserConfig;
}

const asUserConfig = (value: unknown): GlossicUserConfig | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const parsed = GlossicConfigSchema.partial().safeParse(value);

  if (!parsed.success) {
    return undefined;
  }

  const declared = Object.keys(value as Record<string, unknown>);

  return Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => declared.includes(key)),
  ) as GlossicUserConfig;
};


export const loadProjectConfig = async (root: string): Promise<LoadedConfig | undefined> => {
  const file = await findConfigFile(root);
  if (file === undefined) return undefined;

  try {
    const jiti   = createJiti(import.meta.url, { moduleCache: false });
    const loaded = await jiti.import(file, { default: true });

    const values = asUserConfig(loaded);
    return values === undefined ? undefined : { file, values };
  } catch {
    return undefined;
  }
};
