import type { Project, SymbolFact, Unit } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import { buildUnitPrompt, SYSTEM_PROMPT } from "../prompt.js";
import type { UnitSource } from "../prompt.js";

const PROJECT: Project = { id: "root", name: "demo", rootDir: "." };

const SOURCES: UnitSource[] = [
  { path: "src/a.ts", language: "typescript", content: "export const a = 1;", truncated: false },
];

const symbol = (name: string, kind: SymbolFact["kind"]): SymbolFact => ({
  name,
  kind,
  file    : "src/a.ts",
  exported: true,
});

const unit = (symbols: readonly SymbolFact[] | undefined): Unit => ({
  id       : "root:src",
  projectId: "root",
  kind     : "directory",
  name     : "src",
  path     : "src",
  facts    : {
    base: {
      files       : [{ path: "src/a.ts", language: "typescript", bytes: 19 }],
      testFiles   : [],
      ignoredFiles: [],
      languages   : [{ language: "typescript", count: 1 }],
      roleHint    : null,
    },
    ...(symbols === undefined ? {} : { symbols: { symbols: [...symbols] } }),
    producedBy: ["generic"],
  },
  hash: "h",
});

const promptFor = (symbols: readonly SymbolFact[] | undefined): string =>
  buildUnitPrompt({
    unit         : unit(symbols),
    project      : PROJECT,
    workspaceName: "demo",
    sources      : SOURCES,
    lang         : "en",
  }).prompt;

const surfaceLine = (prompt: string): string | undefined =>
  prompt.split("\n").find((line) => line.startsWith("- exported surface: "));

describe("the exported surface in the facts", () => {
  it("states the shape of what the unit exports, not the roll of its names", () => {
    const prompt = promptFor([
      symbol("A", "interface"),
      symbol("b", "function"),
      symbol("C", "interface"),
      symbol("d", "const"),
      symbol("e", "function"),
      symbol("F", "interface"),
    ]);

    expect(surfaceLine(prompt)).toBe("- exported surface: 3 interface, 2 function, 1 const");
  });

  it("names no symbol, every one of them being in the sources already", () => {
    const prompt = promptFor([symbol("createServer", "function"), symbol("Options", "type")]);

    expect(surfaceLine(prompt)).not.toContain("createServer");
    expect(surfaceLine(prompt)).not.toContain("Options");
  });

  it("orders the kinds by count, ties broken by name, so two runs match", () => {
    const prompt = promptFor([
      symbol("a", "type"),
      symbol("b", "class"),
      symbol("c", "const"),
      symbol("d", "class"),
      symbol("e", "const"),
    ]);

    expect(surfaceLine(prompt)).toBe("- exported surface: 2 class, 2 const, 1 type");
  });

  it("gives no total, which is the one number a document quotes back", () => {
    const prompt = promptFor([
      symbol("a", "class"),
      symbol("b", "class"),
      symbol("c", "const"),
    ]);

    expect(surfaceLine(prompt)).toBe("- exported surface: 2 class, 1 const");
    expect(surfaceLine(prompt)).not.toContain("3");
    expect(surfaceLine(prompt)).not.toContain("symbols");
  });

  it("says nothing at all when no enricher named a symbol", () => {
    expect(surfaceLine(promptFor(undefined))).toBeUndefined();
    expect(surfaceLine(promptFor([]))).toBeUndefined();
  });
});

describe("the system prompt", () => {
  it("asks for the public elements a consumer needs, not for an inventory", () => {
    expect(SYSTEM_PROMPT).toContain("Be");
    expect(SYSTEM_PROMPT).toContain("selective");
    expect(SYSTEM_PROMPT).toContain("Do not enumerate every export");
  });

  it("names the kinds of finding the fourth section is for", () => {
    expect(SYSTEM_PROMPT).toContain("the implementation does not match");
    expect(SYSTEM_PROMPT).toContain("uses but never declares");
    expect(SYSTEM_PROMPT).toContain("data lost without a word");
    expect(SYSTEM_PROMPT).toContain("work done twice");
    expect(SYSTEM_PROMPT).toContain("would not survive a restart");
  });

  it("still forbids reaching for a finding that is not there", () => {
    expect(SYSTEM_PROMPT).toContain("an invented finding costs more than a missing one");
  });

  it("keeps the facts out of the document they were handed over to write", () => {
    expect(SYSTEM_PROMPT).toContain("context for writing, not material to quote");
    expect(SYSTEM_PROMPT).toContain("how many symbols the unit exports");
    expect(SYSTEM_PROMPT).toContain("Never open the document by measuring");
  });

  it("asks a map of the files to earn its place instead of forbidding one", () => {
    expect(SYSTEM_PROMPT).toContain("A map of the files is welcome");
    expect(SYSTEM_PROMPT).toContain("says what that file is for");
    expect(SYSTEM_PROMPT).not.toContain("Do not restate the file listing");
  });
});
