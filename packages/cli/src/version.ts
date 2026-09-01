// Read from the manifest, not retyped here: a hardcoded string is a version
// that goes stale the first time anyone bumps the package. esbuild inlines it
// at build time, and vitest resolves it the same way from source.
import manifest from "../package.json" with { type: "json" };

export const CLI_VERSION: string = manifest.version;
export const CLI_NAME            = "glossic";
