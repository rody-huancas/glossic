import process from "node:process";

import { formatCliError } from "./errors.js";
import { runInteractive } from "./interactive/index.js";
import { createProgram } from "./program.js";
import { printBanner, shouldDecorate } from "./ui/banner.js";

export { formatCliError } from "./errors.js";
export { runInteractive } from "./interactive/index.js";
export { detectLanguage } from "./language.js";
export { createProgram } from "./program.js";
export { adapters, builtinAdapters, builtinProviders, providers } from "./registries.js";
export { printBanner, shouldDecorate } from "./ui/banner.js";
export { CLI_NAME, CLI_VERSION } from "./version.js";

const argv = process.argv.slice(2);

try {
  if (argv.length > 0) {
    await createProgram().parseAsync(process.argv);
  } else if (shouldDecorate()) {
    printBanner();
    process.exitCode = await runInteractive();
  } else {
    // No terminal to ask questions in: behave like any other non-interactive
    // tool and say what the flags are.
    createProgram().outputHelp();
  }
} catch (error) {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
}
