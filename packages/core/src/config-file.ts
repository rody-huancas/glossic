import path from "node:path";

import { createJiti } from "jiti";
import { GlossicConfigSchema } from "@glossic/schema";
import type { GlossicUserConfig } from "@glossic/schema";

import { pathExists, toPosix } from "./utils/index.js";

/** Config filenames, in the order they are looked for. */
export const CONFIG_FILENAMES = [
  "glossic.config.ts",
  "glossic.config.mts",
  "glossic.config.js",
  "glossic.config.mjs",
];


/** Posix path of the project's config file, when it has one. */
export const findConfigFile = async (root: string): Promise<string | undefined> => {
  for (const filename of CONFIG_FILENAMES) {
    const candidate = path.resolve(root, filename);
    if (await pathExists(candidate)) {
      return toPosix(candidate);
    }
  }

  return undefined;
};

/** The project has no config file at all. */
export interface MissingConfig {
  status: "missing";
}

/** The file is there but unusable, and `error` is the reason to put in front of the user. */
export interface FailedConfig {
  status: "failed";
  file  : string;
  error : string;
}

/** `values` carries only the keys the file actually set, so a no-op config leaves it empty. */
export interface LoadedConfig {
  status: "loaded";
  file  : string;
  values: GlossicUserConfig;
}

export type ProjectConfig = MissingConfig | FailedConfig | LoadedConfig;

const describeError = (cause: unknown): string => {
  const message = cause instanceof Error ? cause.message : String(cause);

  return message.split("\n")[0]?.trim() || "unknown error";
};

const readDefaultExport = (file: string, value: unknown): FailedConfig | LoadedConfig => {
  const parsed = GlossicConfigSchema.partial().safeParse(value);

  if (!parsed.success) {
    const error = parsed.error.issues
      .map((issue) =>
        issue.path.length === 0 ? issue.message : `${issue.path.join(".")}: ${issue.message}`,
      )
      .join("; ");

    return { status: "failed", file, error };
  }

  const declared = Object.keys(value as Record<string, unknown>);

  const values = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => declared.includes(key)),
  ) as GlossicUserConfig;

  return { status: "loaded", file, values };
};


export const loadProjectConfig = async (root: string): Promise<ProjectConfig> => {
  const file = await findConfigFile(root);

  if (file === undefined) {
    return { status: "missing" };
  }

  try {
    const jiti   = createJiti(import.meta.url, { moduleCache: false });
    const loaded = await jiti.import(file, { default: true });

    return readDefaultExport(file, loaded);
  } catch (cause) {
    return { status: "failed", file, error: describeError(cause) };
  }
};
