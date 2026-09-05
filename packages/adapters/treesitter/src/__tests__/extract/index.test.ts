import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { extractFile } from "../../extract/index.js";
import { disposeGrammars, grammar } from "../../grammars.js";
import type { GrammarName } from "../../languages.js";

const fixture = (file: string): string =>
  fileURLToPath(new URL(`../../__fixtures__/project/${file}`, import.meta.url));

const read = (file: string): Promise<string> => fs.readFile(fixture(file), "utf8");

const extract = async (name: GrammarName, file: string) => {
  return extractFile(await grammar(name), await read(file), path.posix.normalize(file));
};

const named = (symbols: readonly { name: string }[]): string[] => symbols.map((one) => one.name);

afterAll(disposeGrammars);

/**
 * The grammars are vendored wasm built by one tree-sitter release and read by
 * another; nothing but loading them proves the two still agree. An ABI mismatch
 * belongs in CI rather than on the machine of whoever installed the CLI.
 */
describe("the vendored grammars", () => {
  it.each(["javascript", "tsx", "typescript"] as const)("loads and parses %s", async (name) => {
    const loaded = await grammar(name);
    const tree   = loaded.parser.parse("export const x = 1;\n");

    expect(tree).not.toBeNull();
    expect(tree?.rootNode.type).toBe("program");
    expect(tree?.rootNode.hasError).toBe(false);

    tree?.delete();
  });

  it("hands the same parser back on a second call", async () => {
    expect(await grammar("typescript")).toBe(await grammar("typescript"));
  });
});

describe("extractFile over TypeScript", () => {
  it("names every kind of exported declaration", async () => {
    const { symbols } = await extract("typescript", "src/core/service.ts");
    const kinds       = new Map(symbols.map((one) => [one.name, one.kind]));

    expect(kinds.get("VERSION")).toBe("const");
    expect(kinds.get("Repository")).toBe("interface");
    expect(kinds.get("BaseService")).toBe("class");
    expect(kinds.get("OrderService")).toBe("class");
    expect(kinds.get("label")).toBe("function");
    expect(kinds.get("build")).toBe("function");
  });

  it("reads type aliases and enums", async () => {
    const { symbols } = await extract("typescript", "src/core/strings.ts");
    const kinds       = new Map(symbols.map((one) => [one.name, one.kind]));

    expect(kinds.get("Slug")).toBe("type");
    expect(kinds.get("Case")).toBe("enum");
    expect(kinds.get("slugify")).toBe("function");
  });

  it("collapses a set of overloads into one entry", async () => {
    const { symbols } = await extract("typescript", "src/core/strings.ts");

    expect(symbols.filter((one) => one.name === "overloaded")).toHaveLength(1);
  });

  it("marks everything it reports as exported", async () => {
    const { symbols } = await extract("typescript", "src/core/service.ts");

    expect(symbols.every((one) => one.exported)).toBe(true);
  });

  it("leaves out a declaration no export statement names", async () => {
    const { symbols } = await extract("typescript", "src/core/types.ts");

    expect(named(symbols)).toEqual(["Order"]);
  });

  it("publishes a local export with the kind its declaration carries", async () => {
    const { symbols } = await extract("typescript", "src/core/service.ts");
    const internal    = symbols.find((one) => one.name === "internal");

    expect(internal?.kind).toBe("function");
    expect(internal?.signature).toBe("(): number");
  });

  it("publishes an aliased export under the alias, not the local name", async () => {
    const { symbols } = await extract("typescript", "src/core/service.ts");

    expect(symbols.find((one) => one.name === "renamed")?.kind).toBe("const");
    expect(named(symbols)).not.toContain("alsoInternal");
  });

  it("skips a destructured export, which binds no name of its own", async () => {
    const { symbols } = await extract("typescript", "src/core/service.ts");

    expect(named(symbols)).not.toContain("a");
    expect(named(symbols)).not.toContain("b");
  });
});

describe("class members", () => {
  it("lists the public methods under the name of the class", async () => {
    const { symbols } = await extract("typescript", "src/core/service.ts");
    const methods     = symbols.filter((one) => one.kind === "method");

    expect(named(methods)).toEqual([
      "Repository.find",
      "BaseService.run",
      "OrderService.find",
      "OrderService.run",
    ]);
  });

  it("leaves out the constructor and everything the class hides", async () => {
    const { symbols } = await extract("typescript", "src/core/service.ts");
    const methods     = named(symbols.filter((one) => one.kind === "method"));

    expect(methods).not.toContain("OrderService.constructor");
    expect(methods).not.toContain("OrderService.hidden");
    expect(methods).not.toContain("OrderService.alsoHidden");
    expect(methods.some((one) => one.includes("#"))).toBe(false);
  });
});

describe("signatures", () => {
  it("spells a generic function on one line", async () => {
    const { symbols } = await extract("typescript", "src/core/service.ts");

    expect(symbols.find((one) => one.name === "label")?.signature).toBe(
      '<T>(value: T, fallback = "none"): string',
    );
  });

  it("reads the signature of an arrow function off its value", async () => {
    const { symbols } = await extract("typescript", "src/core/service.ts");

    expect(symbols.find((one) => one.name === "build")?.signature).toBe(
      "(prefix: string): Promise<OrderService>",
    );
  });

  it("keeps what a class extends and implements", async () => {
    const { symbols } = await extract("typescript", "src/core/service.ts");

    expect(symbols.find((one) => one.name === "OrderService")?.signature).toBe(
      "extends BaseService implements Repository<Order>",
    );
  });

  it("carries no signature for a binding with no declared type", async () => {
    const { symbols } = await extract("typescript", "src/core/service.ts");

    expect(symbols.find((one) => one.name === "VERSION")).not.toHaveProperty("signature");
  });

  it("gives a type alias its right-hand side", async () => {
    const { symbols } = await extract("typescript", "src/core/strings.ts");

    expect(symbols.find((one) => one.name === "Slug")?.signature).toBe(
      "= string & { readonly brand: unique symbol }",
    );
  });
});

describe("extractFile over TSX and JavaScript", () => {
  it("reads a generic arrow component out of a .tsx file", async () => {
    const { symbols } = await extract("tsx", "src/ui/Button.tsx");
    const button      = symbols.find((one) => one.name === "Button");

    expect(button?.kind).toBe("function");
    expect(button?.signature).toBe("<T,>({ title }: ButtonProps): JSX.Element");
  });

  it("reads a named default export", async () => {
    const { symbols } = await extract("tsx", "src/ui/Button.tsx");

    expect(named(symbols)).toContain("Panel");
  });

  it("reads classes, functions and bindings out of plain JavaScript", async () => {
    const { symbols } = await extract("javascript", "src/ui/legacy.js");
    const kinds       = new Map(symbols.map((one) => [one.name, one.kind]));

    expect(kinds.get("Widget")).toBe("class");
    expect(kinds.get("Widget.render")).toBe("method");
    expect(kinds.get("mount")).toBe("function");
    expect(kinds.get("helper")).toBe("function");
    expect(kinds.get("PLAIN")).toBe("const");
    expect(named(symbols).some((one) => one.includes("#"))).toBe(false);
  });
});

describe("module specifiers", () => {
  it("reports what a file imports and what it re-exports", async () => {
    const { sources } = await extract("typescript", "src/core/service.ts");

    expect(sources).toEqual(["./strings.js", "./types.js"]);
  });

  it("reports the source of a barrel, star re-export included", async () => {
    const { sources } = await extract("typescript", "src/core/index.ts");

    expect(sources).toEqual(["./strings.js", "./service.js"]);
  });

  it("does not republish what a barrel re-exports from elsewhere", async () => {
    const { symbols } = await extract("typescript", "src/core/index.ts");

    expect(symbols).toEqual([]);
  });
});
