import { compareStrings } from "@glossic/schema";

import { splitLargeUnit } from "./split.js";
import { createClassifier, unitName } from "./draft.js";
import { absorbThinLeaves, absorbUndocumentedUnits, groupByDirectory, mergeSubtrees } from "./merge.js";
import type { GroupingOptions, UnitDraft } from "./draft.js";

export { SPLIT_SEPARATOR, createClassifier, unitName } from "./draft.js";
export { filenameRoot, isReadableLabel, splitLargeUnit } from "./split.js";
export { absorbThinLeaves, absorbUndocumentedUnits, groupByDirectory, mergeSubtrees } from "./merge.js";
export type { ThinLeafOptions } from "./merge.js";
export type { FileClassifier, GroupingOptions, UnitDraft } from "./draft.js";


/** The whole grouping pipeline: group by directory, absorb, merge, then split. */
export const shapeUnits = (files: readonly string[], options: GroupingOptions): UnitDraft[] => {
  const classifier = createClassifier(options);
  const grouped    = absorbUndocumentedUnits(groupByDirectory(files, classifier));
  const subtrees   = mergeSubtrees(grouped, options.mergeChildrenInto);
  const merged     = absorbThinLeaves(subtrees, options);

  return merged
    .flatMap((draft) => splitLargeUnit(draft, options.maxUnitFiles))
    .sort((a, b) => compareStrings(unitName(a), unitName(b)));
};
