import { Command } from "commander";
import { checkCommand, generateCommand, initCommand, scanCommand } from "./commands/index.js";
import { CLI_NAME, CLI_VERSION } from "./version.js";

/** Builds the commander program. Exported so tests can inspect it. */
export const createProgram = (): Command => {
  const program = new Command();

  program
    .name(CLI_NAME)
    .description("Documentation generator driven by static analysis and LLM providers")
    .version(CLI_VERSION, "-v, --version", "print the glosik version")
    .showHelpAfterError();

  program.addCommand(scanCommand());
  program.addCommand(generateCommand());
  program.addCommand(checkCommand());
  program.addCommand(initCommand());

  return program;
};
