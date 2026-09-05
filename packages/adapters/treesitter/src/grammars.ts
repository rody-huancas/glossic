import path from "node:path";
import { fileURLToPath } from "node:url";

import { Language, Parser, Query } from "web-tree-sitter";

import { EXPORT_QUERY, MODULE_QUERY } from "./queries.js";
import type { GrammarName } from "./languages.js";

const WASM_DIR = fileURLToPath(new URL("../wasm/", import.meta.url));

export interface Grammar {
  parser : Parser;
  exports: Query;
  modules: Query;
}

const loaded = new Map<GrammarName, Promise<Grammar>>();

let started: Promise<void> | undefined;

const init = (): Promise<void> => {
  started ??= Parser.init();

  return started;
};

const load = async (name: GrammarName): Promise<Grammar> => {
  await init();

  const language = await Language.load(path.join(WASM_DIR, `tree-sitter-${name}.wasm`));
  const parser   = new Parser();

  parser.setLanguage(language);

  return {
    parser,
    exports: new Query(language, EXPORT_QUERY),
    modules: new Query(language, MODULE_QUERY),
  };
};

export const grammar = (name: GrammarName): Promise<Grammar> => {
  const pending = loaded.get(name) ?? load(name);

  loaded.set(name, pending);

  return pending;
};

export const disposeGrammars = async (): Promise<void> => {
  const grammars = await Promise.all(loaded.values());

  loaded.clear();

  for (const { parser, exports, modules } of grammars) {
    exports.delete();
    modules.delete();
    parser.delete();
  }
};
