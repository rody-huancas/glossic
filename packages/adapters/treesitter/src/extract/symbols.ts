import type { SymbolFact, SymbolKind } from "@glossic/schema";
import type { Node } from "web-tree-sitter";

import { aliasSignature, bindingSignature, callableSignature, headerSignature, valueSignature } from "./signature.js";
import { fieldText, isIdentifier, lineOf, namedChildren } from "./nodes.js";

/** What each declaration the grammars name turns into, whatever the language. */
const KIND_BY_TYPE: Readonly<Record<string, SymbolKind>> = {
  abstract_class_declaration    : "class",
  class_declaration             : "class",
  enum_declaration              : "enum",
  function_declaration          : "function",
  function_signature            : "function",
  generator_function_declaration: "function",
  interface_declaration         : "interface",
  type_alias_declaration        : "type",
};

/** Declarations that hold members worth listing beside them. */
const HOLDS_MEMBERS = new Set([
  "abstract_class_declaration",
  "class_declaration",
  "interface_declaration",
]);

const METHOD_TYPES = new Set([
  "abstract_method_signature",
  "method_definition",
  "method_signature",
]);

/** A binding is a function when it is bound to one, whatever the keyword says. */
const FUNCTION_VALUES = new Set(["arrow_function", "function_expression", "generator_function"]);

const VARIABLE_TYPES = new Set(["lexical_declaration", "variable_declaration"]);


/** Hidden from the outside, so it is not part of what the class exports. */
const isHidden = (member: Node): boolean => {
  const name = member.childForFieldName("name");

  if (name?.type === "private_property_identifier") {
    return true;
  }

  return namedChildren(member).some(
    (child) => child.type === "accessibility_modifier" && child.text !== "public",
  );
};


/**
 * The methods of an exported class or interface, which its callers can reach.
 * They carry the owner in their name, so `find` on two exported classes stays
 * two entries rather than one.
 */
const membersOf = (declaration: Node, file: string, owner: string): SymbolFact[] => {
  const body = declaration.childForFieldName("body");

  if (body === null) return [];

  return namedChildren(body)
    .filter((member) => METHOD_TYPES.has(member.type))
    .filter((member) => !isHidden(member))
    .flatMap((member) => {
      const name = member.childForFieldName("name");

      if (!isIdentifier(name) || name.text === "constructor") return [];

      return [
        {
          name     : `${owner}.${name.text}`,
          kind     : "method" as const,
          file,
          signature: callableSignature(member),
          exported : true,
          line     : lineOf(member),
        },
      ];
    });
};


const signatureOf = (declaration: Node): string => {
  if (HOLDS_MEMBERS.has(declaration.type)) {
    return headerSignature(declaration);
  }

  if (declaration.type === "enum_declaration") {
    return "";
  }

  if (declaration.type === "type_alias_declaration") {
    return aliasSignature(declaration);
  }

  return callableSignature(declaration);
};

/** Every binding a `const a = 1, b = 2` declares, skipping the destructured ones. */
const bindingsOf = (declaration: Node, file: string): SymbolFact[] => {
  return namedChildren(declaration)
    .filter((child) => child.type === "variable_declarator")
    .flatMap((declarator) => {
      const name  = declarator.childForFieldName("name");
      const value = declarator.childForFieldName("value");

      if (!isIdentifier(name)) return [];

      const isFunction = value !== null && FUNCTION_VALUES.has(value.type);
      const signature  = isFunction ? valueSignature(declarator) : bindingSignature(declarator);

      return [
        {
          name     : name.text,
          kind     : isFunction ? ("function" as const) : ("const" as const),
          file,
          signature,
          exported : true,
          line     : lineOf(declarator),
        },
      ];
    });
};


/**
 * What the declaration names itself, its members left out. An anonymous
 * `export default class {}` is named for the keyword that exports it, there
 * being nothing else to call it.
 */
export const ownSymbolsOf = (declaration: Node, file: string): SymbolFact[] => {
  if (VARIABLE_TYPES.has(declaration.type)) {
    return bindingsOf(declaration, file);
  }

  const kind = KIND_BY_TYPE[declaration.type];

  if (kind === undefined) return [];

  const name = declaration.childForFieldName("name");

  return [
    {
      name     : isIdentifier(name) ? name.text : "default",
      kind,
      file,
      signature: signatureOf(declaration),
      exported : true,
      line     : lineOf(declaration),
    },
  ];
};


/** What one declaration contributes to the file's exported surface. */
export const symbolsOf = (declaration: Node, file: string): SymbolFact[] => {
  const own = ownSymbolsOf(declaration, file);

  if (!HOLDS_MEMBERS.has(declaration.type)) {
    return own;
  }

  return [...own, ...membersOf(declaration, file, own[0]?.name ?? "default")];
};


/** The name an `export { a as b }` publishes, which is the alias when it has one. */
export const specifierNames = (specifier: Node): { local: string; exported: string } => {
  const local = fieldText(specifier, "name");
  const alias = fieldText(specifier, "alias");

  return { local, exported: alias === "" ? local : alias };
};
