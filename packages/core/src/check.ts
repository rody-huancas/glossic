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

export interface CheckResult {
  outDir  : string;
  upToDate: CheckEntry[];
  missing : CheckEntry[];
  stale   : CheckEntry[];
  orphaned: string[];
  ok      : boolean;
}

interface DocumentFrontmatter {
  unit: string | undefined;
  hash: string | undefined;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

export const readDocFrontmatter = async (file: string): Promise<DocumentFrontmatter> => {
  try {
    const raw   = await fs.readFile(file, "utf8");
    const match = FRONTMATTER.exec(raw);

    if (match === null) {
      return { unit: undefined, hash: undefined };
    }

    const parsed: unknown = parseYaml(match[1] ?? "");
    
    if (typeof parsed !== "object" || parsed === null) {
      return { unit: undefined, hash: undefined };
    }

    const record = parsed as Record<string, unknown>;

    return {
      unit: typeof record.unit === "string" ? record.unit : undefined,
      hash: typeof record.hash === "string" ? record.hash : undefined,
    };
  } catch {
    return { unit: undefined, hash: undefined };
  }
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

  const orphaned = docs
    .filter((doc) => doc !== INDEX_DOC_PATH && !expected.has(doc))
    .sort(compareStrings);

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
