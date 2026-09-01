import { fileURLToPath } from "node:url";

/** Absolute path of one of the repository's example projects. */
export const exampleDir = (name: string): string => {
  return fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url));
}
