import process from "node:process";

import { formatCliError } from "./errors.js";
import { runInteractive } from "./interactive/index.js";
import { createProgram } from "./program.js";
import { printBanner, shouldDecorate } from "./ui/banner.js";

export { createProgram } from "./program.js";
export { formatCliError } from "./errors.js";
export { runInteractive } from "./interactive/index.js";
export { detectLanguage } from "./language.js";
export { CLI_NAME, CLI_VERSION } from "./version.js";
export { printBanner, shouldDecorate } from "./ui/banner.js";
export { adapters, builtinAdapters, builtinProviders, providers } from "./registries.js";

const argv = process.argv.slice(2);

/**
 * Flags run the command, a bare `glossic` on a terminal opens the menu, and a
 * bare `glossic` without one behaves like any other non-interactive tool: it
 * says what the flags are.
 */
try {
  if (argv.length > 0) {
    await createProgram().parseAsync(process.argv);
  } else if (shouldDecorate()) {
    printBanner();
    process.exitCode = await runInteractive();
  } else {
    createProgram().outputHelp();
  }
} catch (error) {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
}
