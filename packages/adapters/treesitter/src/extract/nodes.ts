import type { Node } from "web-tree-sitter";


export const namedChildren = (node: Node): Node[] => {
  return node.namedChildren.filter((child): child is Node => child !== null);
};


export const fieldText = (node: Node, field: string): string => {
  return node.childForFieldName(field)?.text ?? "";
};


export const namedChild = (node: Node, type: string): Node | undefined => {
  return namedChildren(node).find((child) => child.type === type);
};


export const lineOf = (node: Node): number => node.startPosition.row + 1;


export const isIdentifier = (node: Node | null): node is Node => {
  return node?.type.endsWith("identifier") === true;
};
