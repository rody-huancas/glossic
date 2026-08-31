import fs from "node:fs/promises";
import path from "node:path";

import type { ExtractResult, Manifest, Relation, Unit, Workspace } from "@glossic/schema";
import { MANIFEST_VERSION, ManifestSchema } from "@glossic/schema";

import { compareStrings, sortBy } from "./order.js";

/** Where `glossic scan` writes the manifest unless told otherwise. */
export const DEFAULT_MANIFEST_PATH = ".glossic/manifest.json";

export interface BuildManifestOptions {
  /** ISO-8601 timestamp. Injectable so tests get a stable document. */
  generatedAt?: string;
}

const sortUnit = (unit: Unit): Unit => ({
  ...unit,
  facts: {
    ...unit.facts,
    base: {
      ...unit.facts.base,
      files: sortBy(unit.facts.base.files, (file) => file.path),
      languages: [...unit.facts.base.languages].sort(
        (a, b) => b.count - a.count || compareStrings(a.language, b.language),
      ),
    },
    producedBy: [...unit.facts.producedBy].sort(compareStrings),
  },
});

const compareRelations = (a: Relation, b: Relation): number =>
  compareStrings(a.from, b.from) || compareStrings(a.to, b.to) || compareStrings(a.kind, b.kind);

/**
 * Assembles the manifest from a workspace and the per-project extraction
 * results. Every list is sorted here, so the only field that can differ
 * between two runs over unchanged code is `generatedAt`.
 */
export const buildManifest = (
  workspace: Workspace,
  results: readonly ExtractResult[],
  options: BuildManifestOptions = {},
): Manifest => {
  const units = results.flatMap((result) => result.units).map(sortUnit);
  const relations = results.flatMap((result) => result.relations);

  return ManifestSchema.parse({
    version: MANIFEST_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    workspace: {
      ...workspace,
      projects: sortBy(workspace.projects, (project) => project.id),
    },
    units: sortBy(units, (unit) => unit.id),
    relations: [...relations].sort(compareRelations),
  });
};

/** Serializes the manifest exactly as it is written to disk. */
export const serializeManifest = (manifest: Manifest): string =>
  `${JSON.stringify(manifest, null, 2)}\n`;

/** Writes the manifest, creating parent directories as needed. */
export const writeManifest = async (manifest: Manifest, target: string): Promise<string> => {
  const absolute = path.resolve(target);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, serializeManifest(manifest), "utf8");
  return absolute;
};

export const readManifest = async (target: string): Promise<Manifest | undefined> => {
  try {
    const raw = await fs.readFile(path.resolve(target), "utf8");
    return ManifestSchema.parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
};
