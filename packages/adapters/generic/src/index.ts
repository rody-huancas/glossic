import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "tinyglobby";
import { compareStrings, joinPosix, toPosix } from "@glossic/schema";
import type { Adapter, DiscoverContext, DiscoveredUnit, ExtractContext, ExtractResult, FileFact, LanguageCount, Unit } from "@glossic/schema";

import { inferRoleHint } from "./roles.js";
import { inferLanguage } from "./languages.js";
import { SPLIT_SEPARATOR, shapeUnits, unitName } from "./grouping.js";
import { collectGitignores, createGitignoreFilter } from "./gitignore.js";
import type { GroupingOptions, UnitDraft } from "./grouping.js";

export const genericAdapterName = "generic";


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

const sha256 = (value: Buffer | string): string => {
  return createHash("sha256").update(value).digest("hex");
}


const unitId = (projectId: string, draft: UnitDraft): string => {
  return `${projectId}:${unitName(draft)}`;
}

const roleSource = (name: string): string => {
  const split = name.lastIndexOf(SPLIT_SEPARATOR);

  return split === -1 ? name : name.slice(0, split);
};

const countLanguages = (files: readonly FileFact[]): LanguageCount[] => {
  const counts = new Map<string, number>();

  for (const file of files) {
    counts.set(file.language, (counts.get(file.language) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count || compareStrings(a.language, b.language));
};

type Bucket = "doc" | "test" | "ignored";

interface ReadFile {
  fact  : FileFact;
  digest: string;
  bucket: Bucket;
}

const readFile = async (root: string, relativePath: string, bucket: Bucket): Promise<ReadFile | undefined> => {
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


const hashUnit = (entries: readonly ReadFile[]): string => {
  const lines = entries
    .map((entry) => `${entry.bucket}\n${entry.fact.path}\n${entry.digest}\n`)
    .sort(compareStrings);

  return sha256(lines.join(""));
};

const groupingOptions = (ctx: DiscoverContext): GroupingOptions => ({
  ignoreUnits       : ctx.config.ignoreUnits,
  excludeFromContent: ctx.config.excludeFromContent,
  mergeChildrenInto : ctx.config.mergeChildrenInto,
  minUnitFiles      : ctx.config.minUnitFiles,
  maxUnitFiles      : ctx.config.maxUnitFiles,
});


const toDiscovered = (draft: UnitDraft, projectId: string, projectDir: string): DiscoveredUnit => {
  const name = unitName(draft);

  return {
    id: unitId(projectId, draft),
    projectId,
    name,
    path        : name === "root" ? projectDir                                                   : joinPosix(projectDir, name),
    files       : draft.files.map((file) => joinPosix(projectDir, file)).sort(compareStrings),
    testFiles   : draft.testFiles.map((file) => joinPosix(projectDir, file)).sort(compareStrings),
    ignoredFiles: draft.ignoredFiles
      .map((file) => joinPosix(projectDir, file))
      .sort(compareStrings),
  };
};


export const genericAdapter: Adapter = {
  name: genericAdapterName,

  detect: async (): Promise<boolean> => true,

  discover: async (ctx: DiscoverContext): Promise<DiscoveredUnit[]> => {
    const projectDir  = ctx.project.rootDir;
    const projectRoot = path.resolve(ctx.root, projectDir);

    const entries = await glob({
      patterns           : [...ctx.config.include],
      cwd                : projectRoot,
      ignore             : [...HARD_IGNORES, ...ctx.config.exclude],
      onlyFiles          : true,
      followSymbolicLinks: false,
      dot                : true,
    });

    const scopes = await collectGitignores(ctx.root, projectDir, HARD_IGNORES);
    const isGitignored = createGitignoreFilter(scopes);

    const files = entries
      .map(toPosix)
      .filter((file) => inferLanguage(file) !== undefined)
      .filter((file) => !isGitignored(joinPosix(projectDir, file)))
      .sort(compareStrings);

    return shapeUnits(files, groupingOptions(ctx)).map((draft) =>
      toDiscovered(draft, ctx.project.id, projectDir),
    );
  },

  extract: async (ctx: ExtractContext): Promise<ExtractResult> => {
    const units: Unit[] = [];

    for (const discovered of ctx.units) {
      const [documented, tested, ignored] = await Promise.all([
        Promise.all(discovered.files.map((file) => readFile(ctx.root, file, "doc"))),
        Promise.all(discovered.testFiles.map((file) => readFile(ctx.root, file, "test"))),
        Promise.all(discovered.ignoredFiles.map((file) => readFile(ctx.root, file, "ignored"))),
      ]);

      const present = (entries: ReadonlyArray<ReadFile | undefined>): ReadFile[] =>
        entries.filter((entry): entry is ReadFile => entry !== undefined);

      const documentedEntries = present(documented);
      const testedEntries     = present(tested);
      const ignoredEntries    = present(ignored);

      if (documentedEntries.length === 0) continue;

      const byPath       = (a: FileFact, b: FileFact): number => compareStrings(a.path, b.path);
      const files        = documentedEntries.map((entry) => entry.fact).sort(byPath);
      const testFiles    = testedEntries.map((entry) => entry.fact).sort(byPath);
      const ignoredFiles = ignoredEntries.map((entry) => entry.fact).sort(byPath);

      units.push({
        id       : discovered.id,
        projectId: discovered.projectId,
        kind     : "directory",
        name     : discovered.name,
        path     : discovered.path,
        facts    : {
          base: {
            files,
            testFiles,
            ignoredFiles,
            languages: countLanguages(files),
            roleHint : inferRoleHint(roleSource(discovered.name)),
          },
          producedBy: [genericAdapterName],
        },
        hash: hashUnit([...documentedEntries, ...testedEntries, ...ignoredEntries]),
      });
    }

    return {
      units: units.sort((a, b) => compareStrings(a.id, b.id)),
      relations: [],
    };
  },
};

export * from "./grouping.js";
export { inferLanguage, isSourceFile } from "./languages.js";
export { inferRoleHint } from "./roles.js";
export default genericAdapter;
