import { compareStrings } from "@glossic/schema";

import { inferRoleHint } from "../roles/index.js";
import { absorb, emptyDraft, nearestAncestor, sortDraft } from "./draft.js";
import { depthOf, dirname, isDescendantDir, ROOT_UNIT, unitDir } from "./paths.js";
import type { FileClassifier, GroupingOptions, UnitDraft } from "./draft.js";

export const groupByDirectory = (files: readonly string[], classifier: FileClassifier): UnitDraft[] => {
  const drafts = new Map<string, UnitDraft>();

  for (const file of files) {
    const dir  = dirname(file);
    const name = dir === "" ? ROOT_UNIT : dir;

    let draft = drafts.get(name);
    
    if (draft === undefined) {
      draft = emptyDraft(name);
      drafts.set(name, draft);
    }

    if (classifier.isIgnored(file)) {
      draft.ignoredFiles.push(file);
    } else if (classifier.isTest(file)) {
      draft.testFiles.push(file);
    } else {
      draft.files.push(file);
    }
  }

  return [...drafts.values()].map(sortDraft).sort((a, b) => compareStrings(a.dir, b.dir));
};


export const absorbUndocumentedUnits = (drafts: readonly UnitDraft[]): UnitDraft[] => {
  const kept = drafts.filter((draft) => draft.files.length > 0).map((draft) => ({ ...draft }));

  for (const orphan of drafts) {
    if (orphan.files.length > 0) continue;

    const host = nearestAncestor(orphan.dir, kept);

    if (host === undefined) continue;

    host.testFiles    = [...host.testFiles, ...orphan.testFiles].sort(compareStrings);
    host.ignoredFiles = [...host.ignoredFiles, ...orphan.ignoredFiles].sort(compareStrings);
  }

  return kept;
};

const candidateRoots = (drafts: readonly UnitDraft[]): string[] => {
  const roots = new Set<string>();

  for (const draft of drafts) {
    roots.add(draft.dir);

    let dir = unitDir(draft.dir);
    while (dir !== "") {
      dir = dirname(dir);
      roots.add(dir === "" ? ROOT_UNIT : dir);
    }
  }

  return [...roots].sort((a, b) => depthOf(b) - depthOf(a) || compareStrings(a, b));
};


export const mergeSubtrees = (drafts: readonly UnitDraft[], threshold: number): UnitDraft[] => {
  let current = drafts.map((draft) => ({ ...draft }));

  for (const root of candidateRoots(drafts)) {
    const inside = current.filter(
      (draft) => draft.dir === root || isDescendantDir(unitDir(draft.dir), unitDir(root)),
    );

    if (inside.length < 2) continue;

    const total = inside.reduce((sum, draft) => sum + draft.files.length, 0);

    if (total > threshold) continue;

    const merged: UnitDraft = { ...emptyDraft(root), subtreeMerged: true };

    for (const draft of inside) {
      absorb(merged, draft);
    }

    current = [...current.filter((draft) => !inside.includes(draft)), merged];
  }

  return current.sort((a, b) => compareStrings(a.dir, b.dir));
};


const hasDescendantUnit = (draft: UnitDraft, drafts: readonly UnitDraft[]): boolean =>
  drafts.some(
    (other) => other !== draft && isDescendantDir(unitDir(other.dir), unitDir(draft.dir)),
  );


  export type ThinLeafOptions = Pick<GroupingOptions, "minUnitFiles" | "maxUnitFiles">;

export const absorbThinLeaves = (drafts: readonly UnitDraft[], options: ThinLeafOptions): UnitDraft[] => {
  let current = drafts.map((draft) => ({ ...draft }));
  let merged  = true;

  while (merged) {
    merged = false;

    const leaves = [...current].sort(
      (a, b) => depthOf(b.dir) - depthOf(a.dir) || compareStrings(a.dir, b.dir),
    );

    for (const leaf of leaves) {
      if (!current.includes(leaf)) continue;
      if (leaf.files.length >= options.minUnitFiles) continue;
      if (inferRoleHint(leaf.dir) !== null) continue;
      if (hasDescendantUnit(leaf, current)) continue;

      const host = nearestAncestor(leaf.dir, current);

      if (host === undefined) continue;
      if (host.files.length + leaf.files.length > options.maxUnitFiles) continue;

      absorb(host, leaf);
      current = current.filter((candidate) => candidate !== leaf);
      merged  = true;
    }
  }

  return current.sort((a, b) => compareStrings(a.dir, b.dir));
};
