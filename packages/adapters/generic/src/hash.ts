import { createHash } from "node:crypto";

import { compareStrings } from "@glossic/schema";

import type { ReadFile } from "./files.js";

export const sha256 = (value: Buffer | string): string => {
  return createHash("sha256").update(value).digest("hex");
}


export const hashUnit = (entries: readonly ReadFile[]): string => {
  const lines = entries
    .map((entry) => `${entry.bucket}\n${entry.fact.path}\n${entry.digest}\n`)
    .sort(compareStrings);

  return sha256(lines.join(""));
};
