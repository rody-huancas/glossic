import type { Node } from "web-tree-sitter";


/** The named children, without the holes the binding leaves in the array. */
export const namedChildren = (node: Node): Node[] => {
  return node.namedChildren.filter((child): child is Node => child !== null);
};


/** The text of a field, or an empty string when the declaration has no such field. */
export const fieldText = (node: Node, field: string): string => {
  return node.childForFieldName(field)?.text ?? "";
};


/** The first named child of that type, for the pieces the grammar leaves unlabelled. */
export const namedChild = (node: Node, type: string): Node | undefined => {
  return namedChildren(node).find((child) => child.type === type);
};


/** One-based, because that is how an editor counts and how the manifest reads. */
export const lineOf = (node: Node): number => node.startPosition.row + 1;


/** Whether the grammar gave the declaration a name rather than leaving it anonymous. */
export const isIdentifier = (node: Node | null): node is Node => {
  return node?.type.endsWith("identifier") === true;
};
