import type { SymbolFact, SymbolKind } from "@glossic/schema";
import type { Node } from "web-tree-sitter";

import { aliasSignature, bindingSignature, callableSignature, headerSignature, valueSignature } from "./signature.js";
import { fieldText, isIdentifier, lineOf, namedChildren } from "./nodes.js";

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

const FUNCTION_VALUES = new Set(["arrow_function", "function_expression", "generator_function"]);

const VARIABLE_TYPES = new Set(["lexical_declaration", "variable_declaration"]);


const isHidden = (member: Node): boolean => {
  const name = member.childForFieldName("name");

  if (name?.type === "private_property_identifier") {
    return true;
  }

  return namedChildren(member).some(
    (child) => child.type === "accessibility_modifier" && child.text !== "public",
  );
};


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


export const symbolsOf = (declaration: Node, file: string): SymbolFact[] => {
  const own = ownSymbolsOf(declaration, file);

  if (!HOLDS_MEMBERS.has(declaration.type)) {
    return own;
  }

  return [...own, ...membersOf(declaration, file, own[0]?.name ?? "default")];
};


export const specifierNames = (specifier: Node): { local: string; exported: string } => {
  const local = fieldText(specifier, "name");
  const alias = fieldText(specifier, "alias");

  return { local, exported: alias === "" ? local : alias };
};
