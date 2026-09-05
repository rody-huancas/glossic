import type { SymbolFact } from "@glossic/schema";
import type { Node } from "web-tree-sitter";

import { lineOf, namedChildren } from "./nodes.js";
import { ownSymbolsOf, specifierNames, symbolsOf } from "./symbols.js";
import type { Grammar } from "../grammars.js";

export interface FileFacts {
  symbols: SymbolFact[];
  sources: string[];
}

const EMPTY: FileFacts = { symbols: [], sources: [] };

const trimSignature = (symbol: SymbolFact): SymbolFact => {
  const { signature, ...rest } = symbol;

  return signature === undefined || signature === "" ? rest : { ...rest, signature };
};


const localsOf = (root: Node, file: string): Map<string, SymbolFact> => {
  const locals = new Map<string, SymbolFact>();

  for (const child of namedChildren(root)) {
    for (const symbol of ownSymbolsOf(child, file)) {
      if (!locals.has(symbol.name)) locals.set(symbol.name, symbol);
    }
  }

  return locals;
};


export const extractFile = (grammar: Grammar, source: string, file: string): FileFacts => {
  const tree = grammar.parser.parse(source);

  if (tree === null) return EMPTY;

  try {
    const root    = tree.rootNode;
    const locals  = localsOf(root, file);
    const symbols: SymbolFact[] = [];
    const seen    = new Set<string>();

    for (const capture of grammar.exports.captures(root)) {
      if (capture.name === "declaration") {
        symbols.push(...symbolsOf(capture.node, file));
        continue;
      }

      const { local, exported } = specifierNames(capture.node);
      const declared            = locals.get(local);

      symbols.push(
        declared === undefined
          ? { name: exported, kind: "other", file, exported: true, line: lineOf(capture.node) }
          : { ...declared, name: exported },
      );
    }

    return {
      symbols: symbols
        .filter((symbol) => {
          const key = `${symbol.kind}\u0000${symbol.name}`;

          if (seen.has(key)) return false;

          seen.add(key);

          return true;
        })
        .map(trimSignature),
      sources: grammar.modules.captures(root).map((capture) => capture.node.text),
    };
  } finally {
    tree.delete();
  }
};
