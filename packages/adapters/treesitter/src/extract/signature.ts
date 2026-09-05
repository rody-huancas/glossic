import type { Node } from "web-tree-sitter";

import { fieldText } from "./nodes.js";

const MAX_SIGNATURE = 200;

const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();

const clamp = (text: string): string => {
  return text.length <= MAX_SIGNATURE ? text : `${text.slice(0, MAX_SIGNATURE - 1)}…`;
};


export const callableSignature = (node: Node): string => {
  return clamp(
    flatten(
      `${fieldText(node, "type_parameters")}${fieldText(node, "parameters")}${fieldText(node, "return_type")}`,
    ),
  );
};



export const headerSignature = (node: Node): string => {
  const name = node.childForFieldName("name");
  const body = node.childForFieldName("body");

  if (name === null || body === null) return "";

  return clamp(flatten(node.text.slice(name.endIndex - node.startIndex, body.startIndex - node.startIndex)));
};


export const aliasSignature = (node: Node): string => {
  return clamp(flatten(`${fieldText(node, "type_parameters")} = ${fieldText(node, "value")}`));
};


export const bindingSignature = (declarator: Node): string => {
  return clamp(flatten(fieldText(declarator, "type")));
};


export const valueSignature = (declarator: Node): string => {
  const value = declarator.childForFieldName("value");

  return value === null ? "" : callableSignature(value);
};
