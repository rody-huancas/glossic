import { compareStrings } from "@glossic/schema";

import { absorb, emptyDraft, nearestAncestor, sortDraft } from "./draft.js";
import { depthOf, dirname, isDescendantDir, ROOT_UNIT, unitDir } from "./paths.js";
import type { FileClassifier, UnitDraft } from "./draft.js";

/** One draft per directory, with each file sorted into documented, test or ignored. */
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


/**
 * Drops drafts with nothing to document, pushing their tests and ignored files
 * up to the nearest ancestor so those files still count towards its hash.
 */
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

/** Every directory that could act as a merge root, deepest first. */
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


/**
 * Folds a directory and all its descendants into one unit when together they
 * stay under the threshold: a module and its dto and entity folders read as one.
 */
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


/** Makes a thin parent swallow its children until it holds enough files to be worth a page. */
export const mergeSmallParents = (drafts: readonly UnitDraft[], minUnitFiles: number): UnitDraft[] => {
  let current = drafts.map((draft) => ({ ...draft }));
  let merged  = true;

  while (merged) {
    merged = false;

    const parents = [...current].sort(
      (a, b) => depthOf(a.dir) - depthOf(b.dir) || compareStrings(a.dir, b.dir),
    );

    for (const parent of parents) {
      if (!current.includes(parent)) continue;

      while (parent.files.length < minUnitFiles) {
        const child = current
          .filter((candidate) => nearestAncestor(candidate.dir, current) === parent)
          .sort((a, b) => compareStrings(a.dir, b.dir))[0];

        if (child === undefined) break;

        absorb(parent, child);
        current = current.filter((candidate) => candidate !== child);
        merged = true;
      }
    }
  }

  return current.sort((a, b) => compareStrings(a.dir, b.dir));
};
