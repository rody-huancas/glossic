import process from "node:process";

import { formatCliError } from "./errors.js";
import { createProgram } from "./program.js";

export { formatCliError } from "./errors.js";
export { createProgram } from "./program.js";
export { adapters, builtinAdapters, builtinProviders, providers } from "./registries.js";
export { CLI_NAME, CLI_VERSION } from "./version.js";

try {
  await createProgram().parseAsync(process.argv);
} catch (error) {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
}
