import type { AdditiveListKey } from "./defaults.js";

/** Prefix that drops one entry of the default instead of adding to it. */
export const REMOVE_PREFIX = "-";

/**
 * What a config did to one additive list. `unmatched` holds the removals that
 * hit nothing, which is a typo far more often than it is intent.
 */
export interface ListOverride {
  value    : readonly string[];
  added    : readonly string[];
  removed  : readonly string[];
  unmatched: readonly string[];
}

export type ListOverrides = Record<AdditiveListKey, ListOverride>;


/**
 * Folds a config's entries into the default it extends: a bare pattern is
 * appended, one prefixed with `-` drops that default, and `\-` escapes a
 * pattern that really does start with a dash. Order is the default's, then the
 * additions in the order they were written, so two runs resolve identically.
 */
export const applyListOverride = (defaults: readonly string[], entries?: readonly string[] | undefined): ListOverride => {
  if (entries === undefined) {
    return { value: [...defaults], added: [], removed: [], unmatched: [] };
  }
  
  const dropped   = new Set<string>();
  const removed   : string[] = [];
  const unmatched : string[] = [];
  const requested : string[] = [];

  for (const entry of entries) {
    if (entry.startsWith(REMOVE_PREFIX)) {
      const pattern = entry.slice(REMOVE_PREFIX.length);

      if (defaults.includes(pattern)) {
        dropped.add(pattern);
        removed.push(pattern);
      } else {
        unmatched.push(pattern);
      }

      continue;
    }

    requested.push(entry.startsWith(`\\${REMOVE_PREFIX}`) ? entry.slice(1) : entry);
  }

  const value = defaults.filter((pattern) => !dropped.has(pattern));
  const added : string[] = [];

  for (const pattern of requested) {
    if (value.includes(pattern)) {
      continue;
    }

    value.push(pattern);
    added.push(pattern);
  }

  return { value, added, removed, unmatched };
};
