import fs from "node:fs/promises";
import path from "node:path";

import type { ExtractResult, Manifest, Relation, Unit, Workspace } from "@glossic/schema";
import { MANIFEST_VERSION, ManifestSchema } from "@glossic/schema";

import { compareStrings, sortBy } from "./utils/index.js";

export const DEFAULT_MANIFEST_PATH = ".glossic/manifest.json";

export interface BuildManifestOptions {
  generatedAt?: string;
}

/** Sorts everything inside one unit, so its hash does not depend on walk order. */
const sortUnit = (unit: Unit): Unit => ({
  ...unit,
  facts: {
    ...unit.facts,
    base: {
      ...unit.facts.base,
      files    : sortBy(unit.facts.base.files, (file) => file.path),
      languages: [...unit.facts.base.languages].sort(
        (a, b) => b.count - a.count || compareStrings(a.language, b.language),
      ),
    },
    producedBy: [...unit.facts.producedBy].sort(compareStrings),
  },
});

const compareRelations = (a: Relation, b: Relation): number => {
  return compareStrings(a.from, b.from) || compareStrings(a.to, b.to) || compareStrings(a.kind, b.kind);
}


/** Assembles the manifest, sorting every list so two runs over the same code match. */
export const buildManifest = (workspace: Workspace, results: readonly ExtractResult[], options: BuildManifestOptions = {}): Manifest => {
  const units     = results.flatMap((result) => result.units).map(sortUnit);
  const relations = results.flatMap((result) => result.relations);

  return ManifestSchema.parse({
    version    : MANIFEST_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    workspace  : {
      ...workspace,
      projects: sortBy(workspace.projects, (project) => project.id),
    },
    units    : sortBy(units, (unit) => unit.id),
    relations: [...relations].sort(compareRelations),
  });
};

/** The manifest as it lands on disk: JSON, two-space indent, trailing newline. */
export const serializeManifest = (manifest: Manifest): string => {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}


/** Writes the manifest, creating its directory. Returns the absolute path written. */
export const writeManifest = async (manifest: Manifest, target: string): Promise<string> => {
  const absolute = path.resolve(target);

  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, serializeManifest(manifest), "utf8");
  
  return absolute;
};

/** Reads and validates a manifest, or undefined when it is missing or invalid. */
export const readManifest = async (target: string): Promise<Manifest | undefined> => {
  try {
    const raw = await fs.readFile(path.resolve(target), "utf8");
    return ManifestSchema.parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
};
