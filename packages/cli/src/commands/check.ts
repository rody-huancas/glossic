import { Command } from "commander";
import { notImplemented } from "./stub.js";

export const checkCommand = (): Command =>
  new Command("check")
    .description("validate whether the generated docs are stale")
    .option("-m, --manifest <file>", "manifest to compare against")
    .option("--json", "print the report as JSON", false)
    .action(() => {
      notImplemented("check");
    });
