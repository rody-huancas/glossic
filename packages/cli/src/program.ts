import { Command } from "commander";
import {
  checkCommand,
  doctorCommand,
  generateCommand,
  initCommand,
  scanCommand,
} from "./commands/index.js";
import { printBanner } from "./ui/banner.js";
import { CLI_NAME, CLI_VERSION } from "./version.js";

/** Builds the commander program. Exported so tests can inspect it. */
export const createProgram = (): Command => {
  const program = new Command();

  program
    .name(CLI_NAME)
    .description("Documentation generator driven by static analysis and LLM providers")
    .version(CLI_VERSION, "-v, --version", "print the glossic version")
    .showHelpAfterError();

  program.hook("preAction", (_program, action) => {
    const options = action.opts<{ json?: boolean; quiet?: boolean }>();
    printBanner({ json: options.json, quiet: options.quiet });
  });

  program.addCommand(scanCommand());
  program.addCommand(generateCommand());
  program.addCommand(checkCommand());
  program.addCommand(doctorCommand());
  program.addCommand(initCommand());

  return program;
};
