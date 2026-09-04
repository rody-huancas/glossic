import picomatch from "picomatch";
import { compareStrings } from "@glossic/schema";

import { depthOf, isDescendantDir, unitDir } from "./paths.js";

export const SPLIT_SEPARATOR = "~~";


export interface UnitDraft {
  dir           : string;
  group        ?: string;
  files         : string[];
  testFiles     : string[];
  ignoredFiles  : string[];
  subtreeMerged?: boolean;
}


export const unitName = (draft: UnitDraft): string => {
  return draft.group === undefined ? draft.dir : `${draft.dir}${SPLIT_SEPARATOR}${draft.group}`;
}


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


export const sortDraft = (draft: UnitDraft): UnitDraft => ({
  ...draft,
  files       : [...draft.files].sort(compareStrings),
  testFiles   : [...draft.testFiles].sort(compareStrings),
  ignoredFiles: [...draft.ignoredFiles].sort(compareStrings),
});


export const absorb = (target: UnitDraft, source: UnitDraft): void => {
  target.files        = [...target.files, ...source.files].sort(compareStrings);
  target.testFiles    = [...target.testFiles, ...source.testFiles].sort(compareStrings);
  target.ignoredFiles = [...target.ignoredFiles, ...source.ignoredFiles].sort(compareStrings);
};


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


export const createClassifier = (options: GroupingOptions): FileClassifier => ({
  isIgnored: picomatch([...options.ignoreUnits], { dot: true, nocase: true }),
  isTest   : picomatch([...options.excludeFromContent], { dot: true, nocase: true }),
});
