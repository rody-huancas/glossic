import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  Adapter,
  DiscoverContext,
  DiscoveredUnit,
  ExtractContext,
  ExtractResult,
  FileFact,
  LanguageCount,
  Unit,
} from "@glossic/schema";
import { glob } from "tinyglobby";

import { collectGitignores, createGitignoreFilter } from "./gitignore.js";
import { inferLanguage } from "./languages.js";
import { inferRoleHint } from "./roles.js";

export const genericAdapterName = "generic";

/** Never walked into, whatever .gitignore says. */
export const HARD_IGNORES: readonly string[] = [
  "**/.git/**",
  "**/.next/**",
  "**/build/**",
  "**/coverage/**",
  "**/dist/**",
  "**/node_modules/**",
  "**/target/**",
  "**/vendor/**",
];

/** Name of the unit holding the source files sitting at the project root. */
const ROOT_UNIT = "root";

const toPosix = (value: string): string => value.split(path.sep).join("/");

const compareStrings = (a: string, b: string): number => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

const joinPosix = (base: string, segment: string): string => {
  if (base === "." || base === "") return segment;
  return `${base}/${segment}`;
};

const sha256 = (value: Buffer | string): string => createHash("sha256").update(value).digest("hex");

/**
 * A unit is a directory that directly holds at least one source file. Files at
 * the project root are grouped under a unit named "root".
 */
const groupIntoUnits = (
  projectId: string,
  projectDir: string,
  files: readonly string[],
): DiscoveredUnit[] => {
  const byDirectory = new Map<string, string[]>();

  for (const relativeToProject of files) {
    const dir = path.posix.dirname(relativeToProject);
    const name = dir === "." ? ROOT_UNIT : dir;
    const bucket = byDirectory.get(name);
    if (bucket === undefined) byDirectory.set(name, [relativeToProject]);
    else bucket.push(relativeToProject);
  }

  return [...byDirectory.entries()]
    .map(([name, unitFiles]) => ({
      id: `${projectId}:${name}`,
      projectId,
      name,
      path: name === ROOT_UNIT ? projectDir : joinPosix(projectDir, name),
      files: unitFiles.map((file) => joinPosix(projectDir, file)).sort(compareStrings),
    }))
    .sort((a, b) => compareStrings(a.id, b.id));
};

const countLanguages = (files: readonly FileFact[]): LanguageCount[] => {
  const counts = new Map<string, number>();
  for (const file of files) counts.set(file.language, (counts.get(file.language) ?? 0) + 1);

  return [...counts.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count || compareStrings(a.language, b.language));
};

interface ReadFile {
  fact: FileFact;
  digest: string;
}

const readFile = async (root: string, relativePath: string): Promise<ReadFile | undefined> => {
  const language = inferLanguage(relativePath);
  if (language === undefined) return undefined;

  const content = await fs.readFile(path.resolve(root, relativePath));
  return {
    fact: { path: relativePath, language, bytes: content.byteLength },
    digest: sha256(content),
  };
};

/**
 * Stable digest of a unit: the sorted (path, content digest) pairs. Independent
 * of filesystem order, file mtimes and the order files were read in.
 */
const hashUnit = (entries: readonly ReadFile[]): string => {
  const lines = entries
    .map((entry) => `${entry.fact.path}\n${entry.digest}\n`)
    .sort(compareStrings);
  return sha256(lines.join(""));
};

/**
 * The universal fallback adapter. It reads no AST: units are directories,
 * facts are file inventories and folder-name heuristics.
 */
export const genericAdapter: Adapter = {
  name: genericAdapterName,

  detect: async (): Promise<boolean> => true,

  discover: async (ctx: DiscoverContext): Promise<DiscoveredUnit[]> => {
    const projectDir = ctx.project.rootDir;
    const projectRoot = path.resolve(ctx.root, projectDir);

    const entries = await glob({
      patterns: ["**/*"],
      cwd: projectRoot,
      ignore: [...HARD_IGNORES],
      onlyFiles: true,
      followSymbolicLinks: false,
      dot: true,
    });

    const scopes = await collectGitignores(ctx.root, projectDir, HARD_IGNORES);
    const isGitignored = createGitignoreFilter(scopes);

    const files = entries
      .map(toPosix)
      .filter((file) => inferLanguage(file) !== undefined)
      .filter((file) => !isGitignored(joinPosix(projectDir, file)))
      .sort(compareStrings);

    return groupIntoUnits(ctx.project.id, projectDir, files);
  },

  extract: async (ctx: ExtractContext): Promise<ExtractResult> => {
    const units: Unit[] = [];

    for (const discovered of ctx.units) {
      const read = await Promise.all(discovered.files.map((file) => readFile(ctx.root, file)));
      const entries = read.filter((entry): entry is ReadFile => entry !== undefined);
      if (entries.length === 0) continue;

      const files = entries
        .map((entry) => entry.fact)
        .sort((a, b) => compareStrings(a.path, b.path));

      units.push({
        id: discovered.id,
        projectId: discovered.projectId,
        kind: "directory",
        name: discovered.name,
        path: discovered.path,
        facts: {
          base: {
            files,
            languages: countLanguages(files),
            roleHint: inferRoleHint(discovered.name),
          },
          producedBy: [genericAdapterName],
        },
        hash: hashUnit(entries),
      });
    }

    return {
      units: units.sort((a, b) => compareStrings(a.id, b.id)),
      relations: [],
    };
  },
};

export { inferLanguage, isSourceFile } from "./languages.js";
export { inferRoleHint } from "./roles.js";
export default genericAdapter;
