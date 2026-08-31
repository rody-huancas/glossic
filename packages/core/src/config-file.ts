import path from "node:path";

import { pathExists } from "./fs-utils.js";
import { toPosix } from "./paths.js";

/** Looked up in this order; the first hit wins. */
export const CONFIG_FILENAMES = [
  "glosik.config.ts",
  "glosik.config.mts",
  "glosik.config.js",
  "glosik.config.mjs",
];

/**
 * Locates the config file in `root`. Loading it needs a TypeScript loader, so
 * for now glosik only reports whether one exists.
 */
export const findConfigFile = async (root: string): Promise<string | undefined> => {
  for (const filename of CONFIG_FILENAMES) {
    const candidate = path.resolve(root, filename);
    if (await pathExists(candidate)) return toPosix(candidate);
  }
  return undefined;
};
