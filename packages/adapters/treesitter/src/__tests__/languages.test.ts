import { describe, expect, it } from "vitest";

import { MAX_PARSE_BYTES, grammarFor } from "../languages.js";

describe("grammarFor", () => {
  it("sends TypeScript and TSX to the two grammars that cannot share a parser", () => {
    expect(grammarFor("typescript")).toBe("typescript");
    expect(grammarFor("tsx")).toBe("tsx");
  });

  it("sends JavaScript and JSX to the grammar that already reads both", () => {
    expect(grammarFor("javascript")).toBe("javascript");
    expect(grammarFor("jsx")).toBe("javascript");
  });

  it("claims no other language", () => {
    for (const language of ["python", "go", "csharp", "php", "svelte", "json"]) {
      expect(grammarFor(language)).toBeUndefined();
    }
  });
});

describe("MAX_PARSE_BYTES", () => {
  it("leaves room for a real source file", () => {
    expect(MAX_PARSE_BYTES).toBeGreaterThan(100_000);
  });
});
