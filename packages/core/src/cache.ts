import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { sortBy } from "./order.js";

/** Where `glossic generate` keeps its incremental state. */
export const DEFAULT_CACHE_PATH = ".glossic/cache.json";

/** Schema version of the cache document itself. */
export const CACHE_VERSION = "1";

export const CacheEntrySchema = z.object({
  unitId: z.string().min(1),
  /** The unit hash the documentation was written from. */
  unitHash: z.string().min(1),
  promptVersion: z.string().min(1),
  /** The requested model, or "default" when none is pinned in the config. */
  model: z.string().min(1),
  lang: z.string().min(1),
  /** Posix path of the generated document, relative to the docs root. */
  outputPath: z.string().min(1),
  generatedAt: z.string().min(1),
});
export type CacheEntry = z.infer<typeof CacheEntrySchema>;

export const CacheFileSchema = z.object({
  version: z.string().min(1),
  entries: z.array(CacheEntrySchema),
});
export type CacheFile = z.infer<typeof CacheFileSchema>;

export const emptyCache = (): CacheFile => ({ version: CACHE_VERSION, entries: [] });

/**
 * Reads the cache. A missing, unreadable or malformed file is not an error:
 * it just means everything regenerates.
 */
export const readCache = async (target: string): Promise<CacheFile> => {
  try {
    const raw = await fs.readFile(path.resolve(target), "utf8");
    const parsed = CacheFileSchema.parse(JSON.parse(raw));
    return parsed.version === CACHE_VERSION ? parsed : emptyCache();
  } catch {
    return emptyCache();
  }
};

export const serializeCache = (cache: CacheFile): string =>
  `${JSON.stringify({ ...cache, entries: sortBy(cache.entries, (entry) => entry.unitId) }, null, 2)}\n`;

export const writeCache = async (cache: CacheFile, target: string): Promise<string> => {
  const absolute = path.resolve(target);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, serializeCache(cache), "utf8");
  return absolute;
};

export const indexCache = (cache: CacheFile): Map<string, CacheEntry> =>
  new Map(cache.entries.map((entry) => [entry.unitId, entry]));
