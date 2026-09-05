export const EXPORT_QUERY = `
(export_statement declaration: (_) @declaration)

(export_statement !source (export_clause (export_specifier) @specifier))
`;


export const MODULE_QUERY = `
(import_statement source: (string (string_fragment) @source))

(export_statement source: (string (string_fragment) @source))
`;
