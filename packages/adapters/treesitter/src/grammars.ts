import path from "node:path";
import { fileURLToPath } from "node:url";

import { Language, Parser, Query } from "web-tree-sitter";

import { EXPORT_QUERY, MODULE_QUERY } from "./queries.js";
import type { GrammarName } from "./languages.js";

/**
 * Resolved against this module and turned into a filesystem path, never left
 * as a `file://` href: `Language.load` reads it with `fs.readFile`, which on
 * Windows would take the href for a relative name and fail to find it.
 */
const WASM_DIR = fileURLToPath(new URL("../wasm/", import.meta.url));

/** A grammar and everything compiled against it, all of it reused for the whole run. */
export interface Grammar {
  parser : Parser;
  exports: Query;
  modules: Query;
}

const loaded = new Map<GrammarName, Promise<Grammar>>();

let started: Promise<void> | undefined;

/** The runtime boots once per process, however many grammars end up loading. */
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

/**
 * The grammar for a language, loaded on first use. Loading the wasm and
 * compiling the queries costs more than parsing a file does, so both happen
 * once and the parser is reused across every file the run reads.
 */
export const grammar = (name: GrammarName): Promise<Grammar> => {
  const pending = loaded.get(name) ?? load(name);

  loaded.set(name, pending);

  return pending;
};

/** Frees the wasm objects. The CLI exits instead; a test suite does not. */
export const disposeGrammars = async (): Promise<void> => {
  const grammars = await Promise.all(loaded.values());

  loaded.clear();

  for (const { parser, exports, modules } of grammars) {
    exports.delete();
    modules.delete();
    parser.delete();
  }
};
