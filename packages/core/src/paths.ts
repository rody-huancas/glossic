import path from "node:path";

/** Normalizes a path to posix separators so manifests are platform-independent. */
export const toPosix = (value: string): string => value.split(path.sep).join("/");

/**
 * Path of `target` relative to `from`, posix, without a leading "./".
 * Returns "." when both point at the same place.
 */
export const relativePosix = (from: string, target: string): string => {
  const relative = toPosix(path.relative(from, target));
  return relative === "" ? "." : relative;
};

/** Joins two posix path fragments, collapsing the "." root case. */
export const joinPosix = (base: string, segment: string): string => {
  if (base === "." || base === "") return segment;
  if (segment === "." || segment === "") return base;
  return `${base}/${segment}`;
};
