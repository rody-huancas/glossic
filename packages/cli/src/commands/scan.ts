import { Command } from "commander";
import { notImplemented } from "./stub.js";

export const scanCommand = (): Command =>
  new Command("scan")
    .description("analyze workspace structure (static only, no LLM)")
    .argument("[path]", "workspace root", ".")
    .option("-o, --out <file>", "write the manifest to this file")
    .option("-a, --adapter <name...>", "restrict the run to these adapters")
    .option("--json", "print the manifest as JSON", false)
    .action(() => {
      notImplemented("scan");
    });
