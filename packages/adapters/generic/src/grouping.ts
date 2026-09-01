import picomatch from "picomatch";

/**
 * Separator between a directory and the slice it was split into, used in both
 * the unit id and the unit name.
 *
 * "~~" survives every place a unit name travels: "~" is legal on Windows (the
 * reserved set is < > : " / \ | ? *), unreserved in URLs per RFC 3986, and a
 * lone "~~" in markdown never pairs into strikethrough. It also does not occur
 * in real filenames, which "--" did: a TypeORM migration named
 * "1780053959844-create-padron-table.ts" made "--" ambiguous.
 */
export const SPLIT_SEPARATOR = "~~";

const ROOT_UNIT = "root";

/** Beyond this a filename root is too long to read as a unit name. */
const MAX_LABEL_LENGTH = 20;

/** A leading digit means a timestamp, a migration number or a generated id. */
const GENERATED_LABEL = /^\d/;

/**
 * A unit under construction. Paths are relative to the project root while the
 * grouping runs; the adapter joins them to the workspace root at the end.
 */
export interface UnitDraft {
  /** Posix directory relative to the project root, or "root". */
  dir: string;
  /** Label of the slice, when the directory had to be split. */
  group?: string;
  /** Documentable files, sorted. */
  files: string[];
  /** Test files, sorted. Hashed with the unit, never sent as content. */
  testFiles: string[];
  /** Migrations, seeders, generated output. Hashed, never described. */
  ignoredFiles: string[];
  /**
   * Set when the draft absorbed a whole subtree. Such a unit is deliberate and
   * is never split again: the merge already decided it is one thing.
   */
  subtreeMerged?: boolean;
}

/** Display name of a draft: the directory, plus the slice when it was split. */
export const unitName = (draft: UnitDraft): string =>
  draft.group === undefined ? draft.dir : `${draft.dir}${SPLIT_SEPARATOR}${draft.group}`;

export interface GroupingOptions {
  ignoreUnits: readonly string[];
  excludeFromContent: readonly string[];
  mergeChildrenInto: number;
  minUnitFiles: number;
  maxUnitFiles: number;
}

const compareStrings = (a: string, b: string): number => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

const basename = (filePath: string): string => filePath.slice(filePath.lastIndexOf("/") + 1);

const dirname = (filePath: string): string => {
  const index = filePath.lastIndexOf("/");
  return index === -1 ? "" : filePath.slice(0, index);
};

/** The directory a unit stands for, "" for the project root. */
const unitDir = (name: string): string => (name === ROOT_UNIT ? "" : name);

const isDescendantDir = (child: string, parent: string): boolean => {
  if (parent === "") return child !== "";
  return child.startsWith(`${parent}/`);
};

const depthOf = (dir: string): number =>
  dir === ROOT_UNIT || dir === "" ? 0 : dir.split("/").length;

const emptyDraft = (dir: string): UnitDraft => ({
  dir,
  files: [],
  testFiles: [],
  ignoredFiles: [],
});

const sortDraft = (draft: UnitDraft): UnitDraft => ({
  ...draft,
  files: [...draft.files].sort(compareStrings),
  testFiles: [...draft.testFiles].sort(compareStrings),
  ignoredFiles: [...draft.ignoredFiles].sort(compareStrings),
});

/** Folds `source` into `target`, keeping every bucket sorted. */
const absorb = (target: UnitDraft, source: UnitDraft): void => {
  target.files = [...target.files, ...source.files].sort(compareStrings);
  target.testFiles = [...target.testFiles, ...source.testFiles].sort(compareStrings);
  target.ignoredFiles = [...target.ignoredFiles, ...source.ignoredFiles].sort(compareStrings);
};

/**
 * The unit that would own `dir` if no unit stood at it: its nearest ancestor
 * among `drafts`.
 */
const nearestAncestor = (dir: string, drafts: readonly UnitDraft[]): UnitDraft | undefined => {
  let best: UnitDraft | undefined;

  for (const candidate of drafts) {
    if (candidate.dir === dir) continue;
    if (!isDescendantDir(unitDir(dir), unitDir(candidate.dir))) continue;
    if (best === undefined || depthOf(candidate.dir) > depthOf(best.dir)) best = candidate;
  }

  return best;
};

export interface FileClassifier {
  /** No documentable prose: build config, metadata, migrations, generated code. */
  isIgnored: (relativeToProject: string) => boolean;
  /** Hashed with the unit but never sent as content. */
  isTest: (relativeToProject: string) => boolean;
}

export const createClassifier = (options: GroupingOptions): FileClassifier => ({
  isIgnored: picomatch([...options.ignoreUnits], { dot: true }),
  isTest: picomatch([...options.excludeFromContent], { dot: true }),
});

/**
 * Groups project-relative source paths into one draft per directory. Files at
 * the project root land in a unit named "root".
 */
export const groupByDirectory = (
  files: readonly string[],
  classifier: FileClassifier,
): UnitDraft[] => {
  const drafts = new Map<string, UnitDraft>();

  for (const file of files) {
    const dir = dirname(file);
    const name = dir === "" ? ROOT_UNIT : dir;

    let draft = drafts.get(name);
    if (draft === undefined) {
      draft = emptyDraft(name);
      drafts.set(name, draft);
    }

    if (classifier.isIgnored(file)) draft.ignoredFiles.push(file);
    else if (classifier.isTest(file)) draft.testFiles.push(file);
    else draft.files.push(file);
  }

  return [...drafts.values()].map(sortDraft).sort((a, b) => compareStrings(a.dir, b.dir));
};

/**
 * Drops every directory with nothing to document. Its tests, migrations and
 * generated files still describe the code above it, so they move to the
 * nearest ancestor that does have something to document: touching a migration
 * marks the module that owns it stale. With no such ancestor they are dropped.
 */
export const absorbUndocumentedUnits = (drafts: readonly UnitDraft[]): UnitDraft[] => {
  const kept = drafts.filter((draft) => draft.files.length > 0).map((draft) => ({ ...draft }));

  for (const orphan of drafts) {
    if (orphan.files.length > 0) continue;

    const host = nearestAncestor(orphan.dir, kept);
    if (host === undefined) continue;

    host.testFiles = [...host.testFiles, ...orphan.testFiles].sort(compareStrings);
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
 * Bottom-up: a directory absorbs every descendant directory when their
 * documentable files together stay at or below `threshold`. This is the rule
 * that turns a module and its dto, entities and strategies folders into one
 * unit; a subtree too large for the threshold is left alone.
 *
 * The root of a merge does not have to be a unit itself: two sibling leaf
 * directories under an empty parent collapse into that parent.
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
    for (const draft of inside) absorb(merged, draft);

    current = [...current.filter((draft) => !inside.includes(draft)), merged];
  }

  return current.sort((a, b) => compareStrings(a.dir, b.dir));
};

/**
 * A parent unit holding fewer than `minUnitFiles` documentable files absorbs
 * its child units one at a time, in path order, until it reaches the floor.
 * This mops up the thin roots that the subtree merge left behind.
 */
export const mergeSmallParents = (
  drafts: readonly UnitDraft[],
  minUnitFiles: number,
): UnitDraft[] => {
  let current = drafts.map((draft) => ({ ...draft }));
  let merged = true;

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

/**
 * Everything before the first dot: "generate.test.ts" -> "generate". This is
 * the grouping key, not the label — a migration filename is a perfectly good
 * key and a terrible name.
 */
export const filenameRoot = (filePath: string): string => {
  const base = basename(filePath);
  const dot = base.indexOf(".");
  return dot <= 0 ? base : base.slice(0, dot);
};

/** A filename root only becomes a unit name when a human could read it. */
export const isReadableLabel = (root: string): boolean =>
  root.length > 0 && root.length <= MAX_LABEL_LENGTH && !GENERATED_LABEL.test(root);

interface FileGroup {
  root: string;
  files: string[];
  testFiles: string[];
  ignoredFiles: string[];
}

/** Groups a unit's files by filename root, sorted by root. */
const groupByFilenameRoot = (draft: UnitDraft): FileGroup[] => {
  const groups = new Map<string, FileGroup>();

  const add = (file: string, bucket: "files" | "testFiles" | "ignoredFiles"): void => {
    const root = filenameRoot(file);
    let group = groups.get(root);
    if (group === undefined) {
      group = { root, files: [], testFiles: [], ignoredFiles: [] };
      groups.set(root, group);
    }
    group[bucket].push(file);
  };

  for (const file of draft.files) add(file, "files");
  for (const file of draft.testFiles) add(file, "testFiles");
  for (const file of draft.ignoredFiles) add(file, "ignoredFiles");

  return [...groups.values()].sort((a, b) => compareStrings(a.root, b.root));
};

/**
 * Splits a unit holding more than `maxUnitFiles` documentable files. Files
 * sharing a filename root stay together, and the groups are packed in
 * alphabetical order into bins that stay at or below the ceiling.
 *
 * A single group larger than the ceiling is left whole: one oversized unit
 * beats cutting a module in half. So is a unit that absorbed a subtree.
 */
export const splitLargeUnit = (draft: UnitDraft, maxUnitFiles: number): UnitDraft[] => {
  if (draft.subtreeMerged === true) return [draft];
  if (draft.files.length <= maxUnitFiles) return [draft];

  const groups = groupByFilenameRoot(draft);
  const bins: FileGroup[][] = [];
  let bin: FileGroup[] = [];
  let binSize = 0;

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

  // All labels or none: mixing "src~~cache" with "src~~2" reads like a bug.
  const labels = bins.map((entries) => entries[0]?.root ?? "");
  const readable = labels.every(isReadableLabel);

  return bins.map((entries, index) => ({
    dir: draft.dir,
    group: readable ? (labels[index] ?? "") : String(index + 1),
    files: entries.flatMap((entry) => entry.files).sort(compareStrings),
    testFiles: entries.flatMap((entry) => entry.testFiles).sort(compareStrings),
    ignoredFiles: entries.flatMap((entry) => entry.ignoredFiles).sort(compareStrings),
  }));
};

/**
 * The whole unit shaping pass: drop what has nothing to document, collapse
 * subtrees that fit into one unit, mop up thin parents, then split whatever is
 * still a single oversized directory.
 */
export const shapeUnits = (files: readonly string[], options: GroupingOptions): UnitDraft[] => {
  const classifier = createClassifier(options);
  const grouped = absorbUndocumentedUnits(groupByDirectory(files, classifier));
  const subtrees = mergeSubtrees(grouped, options.mergeChildrenInto);
  const merged = mergeSmallParents(subtrees, options.minUnitFiles);

  return merged
    .flatMap((draft) => splitLargeUnit(draft, options.maxUnitFiles))
    .sort((a, b) => compareStrings(unitName(a), unitName(b)));
};
