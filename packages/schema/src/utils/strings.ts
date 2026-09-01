
export const compareStrings = (a: string, b: string): number => {
  if (a < b) return -1;
  if (a > b) return 1;

  return 0;
};

export const sortBy = <T>(values: readonly T[], key: (value: T) => string): T[] => {
  return [...values].sort((a, b) => compareStrings(key(a), key(b)));
}
