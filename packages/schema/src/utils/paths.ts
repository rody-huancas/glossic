import path from "node:path";

/** Rewrites a native path with posix separators, so output matches on every OS. */
export const toPosix = (value: string): string => value.split(path.sep).join("/");


/** Posix path from one location to another, "." when they are the same. */
export const relativePosix = (from: string, target: string): string => {
  const relative = toPosix(path.relative(from, target));
  return relative === "" ? "." : relative;
};


/** Joins two posix fragments, tolerating "." or "" on either side. */
export const joinPosix = (base: string, segment: string): string => {
  if (base === "." || base === "") {
    return segment;
  }

  if (segment === "." || segment === "") {
    return base;
  }
  
  return `${base}/${segment}`;
};
