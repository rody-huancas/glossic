import { describe, expect, it } from "vitest";
import { createProgram } from "./program.js";
import { builtinAdapters, builtinProviders } from "./registries.js";

describe("glosik cli", () => {
  it("registers every command", () => {
    const names = createProgram()
      .commands.map((command) => command.name())
      .sort();
    expect(names).toEqual(["check", "generate", "init", "scan"]);
  });

  it("ships the builtin adapters and providers", () => {
    expect(builtinAdapters.map((adapter) => adapter.name)).toEqual([
      "generic",
      "treesitter",
      "nestjs",
    ]);
    expect(builtinProviders.map((provider) => provider.name)).toEqual(["claude-code", "anthropic"]);
  });
});
