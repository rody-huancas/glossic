import fs from "node:fs/promises";
import path from "node:path";

/**
 * Whether `generate` has already written anything worth building a site from.
 * The menu asks on every turn, so it stops at the first page it finds rather
 * than walking the whole tree.
 */
export const hasGeneratedDocs = async (root: string, outDir: string): Promise<boolean> => {
  const start = path.resolve(root, outDir);

  const walk = async (dir: string): Promise<boolean> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        return true;
      }

      if (entry.isDirectory() && (await walk(path.join(dir, entry.name)))) {
        return true;
      }
    }

    return false;
  };

  return walk(start);
};
