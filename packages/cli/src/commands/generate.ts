import { Command } from "commander";
import { notImplemented } from "./stub.js";

export const generateCommand = (): Command =>
  new Command("generate")
    .description("generate documentation (scan + LLM completion)")
    .argument("[path]", "workspace root", ".")
    .option("-o, --out <dir>", "output directory")
    .option("-p, --provider <name>", "completion provider")
    .option("-m, --model <name>", "model id")
    .option("-c, --concurrency <n>", "parallel completions")
    .option("--dry-run", "resolve everything but write nothing", false)
    .action(() => {
      notImplemented("generate");
    });
