import { fileURLToPath } from "node:url";

/** Absolute path of a fixture under `examples/`. Repo-local, not published. */
export const exampleDir = (name: string): string =>
  fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url));
