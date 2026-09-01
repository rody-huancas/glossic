import path from "node:path";

import { toPosix } from "@glossic/core";

import type { MessageKey, Translator } from "../i18n/index.js";

/** Counted nouns need both forms, and Spanish does not pluralise with an "s". */
export const counted = (
  t: Translator,
  count: number,
  noun: "project" | "unit" | "file" | "problem",
) => t(`count.${noun}${count === 1 ? "" : "s"}` as MessageKey, { count });

/** A path outside the cwd reads better absolute than as a pile of "../". */
export const displayPath = (cwd: string, target: string): string => {
  const relative = toPosix(path.relative(cwd, target));
  return relative === "" || relative.startsWith("..") ? toPosix(target) : relative;
};
