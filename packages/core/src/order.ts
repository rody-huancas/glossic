/**
 * Locale-independent string comparison. `localeCompare` depends on the ICU
 * data shipped with the runtime, which would make the manifest differ between
 * machines.
 */
export const compareStrings = (a: string, b: string): number => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

/** Sorts a copy of `values` by a derived key, ascending. */
export const sortBy = <T>(values: readonly T[], key: (value: T) => string): T[] =>
  [...values].sort((a, b) => compareStrings(key(a), key(b)));
