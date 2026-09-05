import type { Node } from "web-tree-sitter";

import { fieldText } from "./nodes.js";

/** Past this a signature stops informing and starts filling the manifest. */
const MAX_SIGNATURE = 200;

/** One line, single-spaced, so a declaration wrapped over four lines reads as one. */
const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();

const clamp = (text: string): string => {
  return text.length <= MAX_SIGNATURE ? text : `${text.slice(0, MAX_SIGNATURE - 1)}…`;
};


/** `<T>(a: T, b?: number): Promise<T>`, from the three fields that spell it. */
export const callableSignature = (node: Node): string => {
  return clamp(
    flatten(
      `${fieldText(node, "type_parameters")}${fieldText(node, "parameters")}${fieldText(node, "return_type")}`,
    ),
  );
};



/**
 * Everything a class or an interface says between its name and its body, which
 * is its type parameters and whatever it extends or implements.
 */
export const headerSignature = (node: Node): string => {
  const name = node.childForFieldName("name");
  const body = node.childForFieldName("body");

  if (name === null || body === null) return "";

  return clamp(flatten(node.text.slice(name.endIndex - node.startIndex, body.startIndex - node.startIndex)));
};


/** `<T> = { a: T } | string`, the right-hand side included because that is the type. */
export const aliasSignature = (node: Node): string => {
  return clamp(flatten(`${fieldText(node, "type_parameters")} = ${fieldText(node, "value")}`));
};


/** The declared type of a binding, when it carries one; an inferred one is not written down. */
export const bindingSignature = (declarator: Node): string => {
  return clamp(flatten(fieldText(declarator, "type")));
};


/** The parameters of the function a `const` is bound to, read off the value. */
export const valueSignature = (declarator: Node): string => {
  const value = declarator.childForFieldName("value");

  return value === null ? "" : callableSignature(value);
};
