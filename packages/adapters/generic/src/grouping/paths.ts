export const ROOT_UNIT        = "root";

export const basename = (filePath: string): string => filePath.slice(filePath.lastIndexOf("/") + 1);

export const dirname = (filePath: string): string => {
  const index = filePath.lastIndexOf("/");
  return index === -1 ? "" : filePath.slice(0, index);
};

export const unitDir = (name: string): string => (name === ROOT_UNIT ? "" : name);

export const isDescendantDir = (child: string, parent: string): boolean => {
  if (parent === "") {
    return child !== "";
  }

  return child.startsWith(`${parent}/`);
};

export const depthOf = (dir: string): number => {
  return dir === ROOT_UNIT || dir === "" ? 0 : dir.split("/").length;
}
