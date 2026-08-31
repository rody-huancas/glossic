import { describe, expect, it } from "vitest";

import { createProgram } from "./program.js";
import { builtinAdapters, builtinProviders } from "./registries.js";

describe("glosik cli", () => {
  it("registers every command", () => {
    const names = createProgram()
      .commands.map((command) => command.name())
      .sort();
    expect(names).toEqual(["check", "doctor", "generate", "init", "scan"]);
  });

  it("keeps the generic adapter last so it stays the fallback", () => {
    expect(builtinAdapters.map((adapter) => adapter.name)).toEqual([
      "nestjs",
      "treesitter",
      "generic",
    ]);
    expect(builtinProviders.map((provider) => provider.name)).toEqual(["claude-code", "anthropic"]);
  });
});
