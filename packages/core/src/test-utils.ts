import { fileURLToPath } from "node:url";

export const exampleDir = (name: string): string => {
  return fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url));
}
