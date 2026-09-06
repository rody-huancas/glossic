import path from "node:path";

export const resolveDocsDir = (
  paths     : { cwd: string; root: string },
  explicit  : string | undefined,
  recorded  : string | undefined,
  fromConfig: string,
): string => {
  if (explicit !== undefined) {
    return path.resolve(paths.cwd, explicit);
  }

  return path.resolve(paths.root, recorded ?? fromConfig);
};
