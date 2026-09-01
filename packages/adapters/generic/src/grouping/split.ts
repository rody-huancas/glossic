import { compareStrings } from "@glossic/schema";

import { basename } from "./paths.js";
import type { UnitDraft } from "./draft.js";

const MAX_LABEL_LENGTH = 20;
const GENERATED_LABEL  = /^\d/;

export const filenameRoot = (filePath: string): string => {
  const base = basename(filePath);
  const dot  = base.indexOf(".");

  return dot <= 0 ? base : base.slice(0, dot);
};


export const isReadableLabel = (root: string): boolean => {
  return root.length > 0 && root.length <= MAX_LABEL_LENGTH && !GENERATED_LABEL.test(root);
}

interface FileGroup {
  root        : string;
  files       : string[];
  testFiles   : string[];
  ignoredFiles: string[];
}

const groupByFilenameRoot = (draft: UnitDraft): FileGroup[] => {
  const groups = new Map<string, FileGroup>();

  const add = (file: string, bucket: "files" | "testFiles" | "ignoredFiles"): void => {
    const root = filenameRoot(file);
    let group  = groups.get(root);

    if (group === undefined) {
      group = { root, files: [], testFiles: [], ignoredFiles: [] };
      groups.set(root, group);
    }
    group[bucket].push(file);
  };

  for (const file of draft.files) {
    add(file, "files");
  }

  for (const file of draft.testFiles) {
    add(file, "testFiles");
  }

  for (const file of draft.ignoredFiles) {
    add(file, "ignoredFiles");
  }

  return [...groups.values()].sort((a, b) => compareStrings(a.root, b.root));
};

export const splitLargeUnit = (draft: UnitDraft, maxUnitFiles: number): UnitDraft[] => {
  if (draft.subtreeMerged === true) {
    return [draft];
  }

  if (draft.files.length <= maxUnitFiles) {
    return [draft];
  }

  const groups              = groupByFilenameRoot(draft);
  const bins: FileGroup[][] = [];
  let bin: FileGroup[]      = [];
  let binSize               = 0;

  for (const group of groups) {
    if (bin.length > 0 && binSize + group.files.length > maxUnitFiles) {
      bins.push(bin);
      bin = [];
      binSize = 0;
    }
    bin.push(group);
    binSize += group.files.length;
  }

  if (bin.length > 0) bins.push(bin);

  if (bins.length <= 1) return [draft];

  const labels   = bins.map((entries) => entries[0]?.root ?? "");
  const readable = labels.every(isReadableLabel);

  return bins.map((entries, index) => ({
    dir         : draft.dir,
    group       : readable ? (labels[index] ?? "") : String(index + 1),
    files       : entries.flatMap((entry) => entry.files).sort(compareStrings),
    testFiles   : entries.flatMap((entry) => entry.testFiles).sort(compareStrings),
    ignoredFiles: entries.flatMap((entry) => entry.ignoredFiles).sort(compareStrings),
  }));
};
