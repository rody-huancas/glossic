import fs from "node:fs/promises";
import path from "node:path";

import { compareStrings } from "@glossic/schema";
import type { FileFact, LanguageCount } from "@glossic/schema";

import { sha256 } from "./hash.js";
import { inferLanguage } from "./languages.js";

/** Languages in a unit, most files first, ties broken by name so the order is total. */
export const countLanguages = (files: readonly FileFact[]): LanguageCount[] => {
  const counts = new Map<string, number>();

  for (const file of files) {
    counts.set(file.language, (counts.get(file.language) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count || compareStrings(a.language, b.language));
};

/** Why a file is in the unit: documented, a test, or ignored but still hashed. */
export type Bucket = "doc" | "test" | "ignored";

export interface ReadFile {
  fact  : FileFact;
  digest: string;
  bucket: Bucket;
}

/** Reads a file and digests it, or returns undefined when its extension is not source. */
export const readFile = async (root: string, relativePath: string, bucket: Bucket): Promise<ReadFile | undefined> => {
  const language = inferLanguage(relativePath);

  if (language === undefined) {
    return undefined;
  }

  const content = await fs.readFile(path.resolve(root, relativePath));

  return {
    fact  : { path: relativePath, language, bytes: content.byteLength },
    digest: sha256(content),
    bucket,
  };
};
