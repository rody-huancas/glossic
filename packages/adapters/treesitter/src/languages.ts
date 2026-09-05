/**
 * Over this a file is generated, bundled or minified rather than written, and
 * parsing it costs more than the symbols are worth. It is deliberately far
 * above core's prompt cap: that one bounds what an LLM reads, this one bounds
 * what tree-sitter walks.
 */
export const MAX_PARSE_BYTES = 512_000;

/** The three grammars vendored under `wasm/`. */
export type GrammarName = "javascript" | "tsx" | "typescript";


/**
 * Which grammar reads a language the base adapter named. JSX lives inside the
 * javascript grammar, but TSX needs its own: `<T>x` is a cast in a .ts file
 * and an element in a .tsx one, so the two cannot share a parser.
 */
const GRAMMAR_BY_LANGUAGE: Readonly<Record<string, GrammarName>> = {
  javascript: "javascript",
  jsx       : "javascript",
  tsx       : "tsx",
  typescript: "typescript",
};

/** The grammar for a language, or undefined when this adapter does not read it. */
export const grammarFor = (language: string): GrammarName | undefined => {
  return GRAMMAR_BY_LANGUAGE[language];
};
