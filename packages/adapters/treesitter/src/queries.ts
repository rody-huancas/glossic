/**
 * One query for every grammar: each pattern names only nodes that javascript,
 * typescript and tsx all have, so nothing here has to branch per language.
 * What each declaration turns out to be is read off the node itself, which
 * keeps the optional pieces of a signature out of the pattern combinatorics.
 *
 * `!source` leaves out `export { a } from "./b.js"`: a barrel re-exports what
 * another file declares, and that file reports it with its real kind already.
 */
export const EXPORT_QUERY = `
(export_statement declaration: (_) @declaration)

(export_statement !source (export_clause (export_specifier) @specifier))
`;


/** Both halves of a module edge: what a file imports, and what it re-exports. */
export const MODULE_QUERY = `
(import_statement source: (string (string_fragment) @source))

(export_statement source: (string (string_fragment) @source))
`;
