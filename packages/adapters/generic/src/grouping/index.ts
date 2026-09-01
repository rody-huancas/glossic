import { compareStrings } from "@glossic/schema";

import { splitLargeUnit } from "./split.js";
import { createClassifier, unitName } from "./draft.js";
import { absorbUndocumentedUnits, groupByDirectory, mergeSmallParents, mergeSubtrees } from "./merge.js";
import type { GroupingOptions, UnitDraft } from "./draft.js";

export { SPLIT_SEPARATOR, createClassifier, unitName } from "./draft.js";
export { absorbUndocumentedUnits, groupByDirectory, mergeSmallParents, mergeSubtrees } from "./merge.js";
export { filenameRoot, isReadableLabel, splitLargeUnit } from "./split.js";
export type { FileClassifier, GroupingOptions, UnitDraft } from "./draft.js";


/** The whole grouping pipeline: group by directory, absorb, merge, then split. */
export const shapeUnits = (files: readonly string[], options: GroupingOptions): UnitDraft[] => {
  const classifier = createClassifier(options);
  const grouped    = absorbUndocumentedUnits(groupByDirectory(files, classifier));
  const subtrees   = mergeSubtrees(grouped, options.mergeChildrenInto);
  const merged     = mergeSmallParents(subtrees, options.minUnitFiles);

  return merged
    .flatMap((draft) => splitLargeUnit(draft, options.maxUnitFiles))
    .sort((a, b) => compareStrings(unitName(a), unitName(b)));
};
