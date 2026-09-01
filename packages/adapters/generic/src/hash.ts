import { createHash } from "node:crypto";

import { compareStrings } from "@glossic/schema";

import type { ReadFile } from "./files.js";

/** Hex sha256 of a string or buffer. */
export const sha256 = (value: Buffer | string): string => {
  return createHash("sha256").update(value).digest("hex");
}


/**
 * Fingerprint of a unit's contents. The lines are sorted before hashing so the
 * digest does not depend on the order the filesystem returned the files in.
 */
export const hashUnit = (entries: readonly ReadFile[]): string => {
  const lines = entries
    .map((entry) => `${entry.bucket}\n${entry.fact.path}\n${entry.digest}\n`)
    .sort(compareStrings);

  return sha256(lines.join(""));
};
