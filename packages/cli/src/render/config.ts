import { ADDITIVE_LIST_KEYS } from "@glossic/schema";
import type { ListOverrides } from "@glossic/schema";

import { counted } from "./shared.js";
import type { Translator } from "../i18n/index.js";


export const renderUnmatchedRemovals = (lists: ListOverrides, t: Translator): string => {
  const lines: string[] = [];

  for (const key of ADDITIVE_LIST_KEYS) {
    const unmatched = lists[key].unmatched;

    if (unmatched.length === 0) {
      continue;
    }

    lines.push(
      counted(t, unmatched.length, "config.unmatchedRemoval", {
        key,
        patterns: unmatched.join(", "),
      }),
    );
  }

  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
};
