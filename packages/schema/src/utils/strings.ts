
/** Total order over strings, so a sort never depends on the machine's locale. */
export const compareStrings = (a: string, b: string): number => {
  if (a < b) return -1;
  if (a > b) return 1;

  return 0;
};

/** Sorts a copy by a string key, leaving the input untouched. */
export const sortBy = <T>(values: readonly T[], key: (value: T) => string): T[] => {
  return [...values].sort((a, b) => compareStrings(key(a), key(b)));
}
