import picomatch from "picomatch";
import { compareStrings } from "@glossic/schema";

import { depthOf, isDescendantDir, unitDir } from "./paths.js";

/** Separates a directory from its group label when one unit is split into several. */
export const SPLIT_SEPARATOR = "~~";

/** A unit while it is still being shaped, before it becomes a DiscoveredUnit. */
export interface UnitDraft {
  dir           : string;
  group        ?: string;
  files         : string[];
  testFiles     : string[];
  ignoredFiles  : string[];
  subtreeMerged?: boolean;
}

/** The name a draft will carry, including its group label when it was split. */
export const unitName = (draft: UnitDraft): string => {
  return draft.group === undefined ? draft.dir : `${draft.dir}${SPLIT_SEPARATOR}${draft.group}`;
}

/** The config knobs that decide how files become units. */
export interface GroupingOptions {
  ignoreUnits       : readonly string[];
  excludeFromContent: readonly string[];
  mergeChildrenInto : number;
  minUnitFiles      : number;
  maxUnitFiles      : number;
}

export const emptyDraft = (dir: string): UnitDraft => ({
  dir,
  files       : [],
  testFiles   : [],
  ignoredFiles: [],
});


/** A copy with every file list sorted, so grouping does not depend on walk order. */
export const sortDraft = (draft: UnitDraft): UnitDraft => ({
  ...draft,
  files       : [...draft.files].sort(compareStrings),
  testFiles   : [...draft.testFiles].sort(compareStrings),
  ignoredFiles: [...draft.ignoredFiles].sort(compareStrings),
});


/** Moves every file of one draft into another, keeping the lists sorted. */
export const absorb = (target: UnitDraft, source: UnitDraft): void => {
  target.files        = [...target.files, ...source.files].sort(compareStrings);
  target.testFiles    = [...target.testFiles, ...source.testFiles].sort(compareStrings);
  target.ignoredFiles = [...target.ignoredFiles, ...source.ignoredFiles].sort(compareStrings);
};


/** The deepest draft that contains this directory, which is where an orphan goes. */
export const nearestAncestor = (dir: string, drafts: readonly UnitDraft[]): UnitDraft | undefined => {
  let best: UnitDraft | undefined;

  for (const candidate of drafts) {
    if (candidate.dir === dir) {
      continue;
    }

    if (!isDescendantDir(unitDir(dir), unitDir(candidate.dir))) {
      continue;
    }
    
    if (best === undefined || depthOf(candidate.dir) > depthOf(best.dir)) {
      best = candidate;
    }
  }

  return best;
};

export interface FileClassifier {
  isIgnored: (relativeToProject: string) => boolean;
  isTest   : (relativeToProject: string) => boolean;
}


/** Compiles the ignore and test globs once, for reuse across every file. */
export const createClassifier = (options: GroupingOptions): FileClassifier => ({
  isIgnored: picomatch([...options.ignoreUnits], { dot: true }),
  isTest   : picomatch([...options.excludeFromContent], { dot: true }),
});
