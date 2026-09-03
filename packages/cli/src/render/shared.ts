import path from "node:path";

import { toPosix } from "@glossic/core";

import type { MessageKey, Translator } from "../i18n/index.js";

/** The base of a message that comes in a singular and a plural form. */
type BaseOf<K> = K extends `${infer Base}.one` ? Base : never;

/** Every message family the catalogue declares both forms of. */
export type CountedKey = BaseOf<MessageKey>;

/**
 * The wording that agrees with the count.
 *
 * Spanish inflects the whole clause and not just the noun -- "1 unit pendiente"
 * against "2 units pendientes" -- so a counted message is two strings in the
 * catalogue rather than one string and an "s", and this picks between them.
 * Every counter the CLI prints goes through here.
 */
export const counted = (
  t     : Translator,
  count : number,
  key   : CountedKey,
  params: Record<string, string | number> = {},
): string => t(`${key}.${count === 1 ? "one" : "many"}` as MessageKey, { count, ...params });

/** A path outside the cwd reads better absolute than as a pile of "../". */
export const displayPath = (cwd: string, target: string): string => {
  const relative = toPosix(path.relative(cwd, target));
  return relative === "" || relative.startsWith("..") ? toPosix(target) : relative;
};
