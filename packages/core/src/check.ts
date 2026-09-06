import fs from "node:fs/promises";
import path from "node:path";

import type { Manifest } from "@glossic/schema";
import { glob } from "tinyglobby";
import { parse as parseYaml } from "yaml";

import { scan } from "./scan/index.js";
import { INDEX_DOC_PATH, unitDocPath } from "./markdown.js";
import { compareStrings, sortBy, toPosix } from "./utils/index.js";
import type { PipelineContext } from "./scan/index.js";

export interface CheckContext extends PipelineContext {
  outDir: string;
}

export interface CheckEntry {
  unitId        : string;
  docPath       : string;
  expectedHash  : string;
  documentedHash: string | undefined;
}

/** `orphaned` names only documents glossic wrote: markdown it did not generate is left alone. */
export interface CheckResult {
  outDir  : string;
  upToDate: CheckEntry[];
  missing : CheckEntry[];
  stale   : CheckEntry[];
  orphaned: string[];
  ok      : boolean;
}

interface DocumentFrontmatter {
  unit       : string | undefined;
  hash       : string | undefined;
  generatedAt: string | undefined;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

const NO_FRONTMATTER: DocumentFrontmatter = {
  unit       : undefined,
  hash       : undefined,
  generatedAt: undefined,
};

/** The fields `renderUnitDoc` writes, all undefined when there is no readable frontmatter. */
export const readDocFrontmatter = async (file: string): Promise<DocumentFrontmatter> => {
  try {
    const raw   = await fs.readFile(file, "utf8");
    const match = FRONTMATTER.exec(raw);

    if (match === null) {
      return NO_FRONTMATTER;
    }

    const parsed: unknown = parseYaml(match[1] ?? "");

    if (typeof parsed !== "object" || parsed === null) {
      return NO_FRONTMATTER;
    }

    const record = parsed as Record<string, unknown>;

    return {
      unit       : typeof record.unit === "string" ? record.unit : undefined,
      hash       : typeof record.hash === "string" ? record.hash : undefined,
      generatedAt: typeof record.generatedAt === "string" ? record.generatedAt : undefined,
    };
  } catch {
    return NO_FRONTMATTER;
  }
};

/**
 * Whether glossic wrote the page: only a document of ours carries all three
 * fields, so hand-written markdown in the output directory is never touched.
 */
const isGeneratedDoc = (frontmatter: DocumentFrontmatter): boolean => {
  return (
    frontmatter.unit !== undefined &&
    frontmatter.hash !== undefined &&
    frontmatter.generatedAt !== undefined
  );
};

const listDocs = async (outDir: string): Promise<string[]> => {
  try {
    const entries = await glob({
      patterns           : ["**/*.md"],
      cwd                : outDir,
      onlyFiles          : true,
      followSymbolicLinks: false,
    });

    return entries.map(toPosix).sort(compareStrings);
  } catch {
    return [];
  }
};


export const check = async (ctx: CheckContext): Promise<CheckResult> => {
  const { manifest }: { manifest: Manifest } = await scan(ctx);

  const docs     = await listDocs(ctx.outDir);
  const expected = new Map(manifest.units.map((unit) => [unitDocPath(unit), unit]));

  const upToDate: CheckEntry[] = [];
  const missing : CheckEntry[] = [];
  const stale   : CheckEntry[] = [];

  for (const unit of manifest.units) {
    const docPath   = unitDocPath(unit);
    const entryBase = { unitId: unit.id, docPath, expectedHash: unit.hash };

    if (!docs.includes(docPath)) {
      missing.push({ ...entryBase, documentedHash: undefined });
      continue;
    }

    const { hash } = await readDocFrontmatter(path.resolve(ctx.outDir, docPath));

    if (hash === unit.hash) {
      upToDate.push({ ...entryBase, documentedHash: hash });
    } else {
      stale.push({ ...entryBase, documentedHash: hash });
    }
  }

  const unclaimed          = docs.filter((doc) => doc !== INDEX_DOC_PATH && !expected.has(doc));
  const orphaned: string[] = [];

  for (const doc of unclaimed) {
    const frontmatter = await readDocFrontmatter(path.resolve(ctx.outDir, doc));

    if (isGeneratedDoc(frontmatter)) orphaned.push(doc);
  }

  orphaned.sort(compareStrings);

  const byUnitId = (entries: CheckEntry[]): CheckEntry[] => {
    return sortBy(entries, (entry) => entry.unitId);
  }

  return {
    outDir  : toPosix(ctx.outDir),
    upToDate: byUnitId(upToDate),
    missing : byUnitId(missing),
    stale   : byUnitId(stale),
    orphaned,
    ok: missing.length === 0 && stale.length === 0 && orphaned.length === 0,
  };
};
