import path from "node:path";

export const toPosix = (value: string): string => value.split(path.sep).join("/");


export const relativePosix = (from: string, target: string): string => {
  const relative = toPosix(path.relative(from, target));
  return relative === "" ? "." : relative;
};


export const joinPosix = (base: string, segment: string): string => {
  if (base === "." || base === "") {
    return segment;
  }

  if (segment === "." || segment === "") {
    return base;
  }
  
  return `${base}/${segment}`;
};
