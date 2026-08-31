import { createProgram } from "./program.js";

export { createProgram } from "./program.js";
export { adapters, builtinAdapters, builtinProviders, providers } from "./registries.js";
export { CLI_NAME, CLI_VERSION } from "./version.js";

await createProgram().parseAsync(process.argv);
