import { Command } from "commander";
import { notImplemented } from "./stub.js";

export const initCommand = (): Command =>
  new Command("init")
    .description("create glosik.config.ts")
    .option("-f, --force", "overwrite an existing config", false)
    .action(() => {
      notImplemented("init");
    });
