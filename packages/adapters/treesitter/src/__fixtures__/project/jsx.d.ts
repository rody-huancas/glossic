/**
 * Just enough of the JSX namespace for the .tsx fixture to stand on its own.
 * The fixture exists to be parsed, not compiled, and an editor that finds no
 * tsconfig for it falls back to one that expects React to be installed.
 */
declare namespace JSX {
  type Element = unknown;

  interface IntrinsicElements {
    [tag: string]: Record<string, unknown>;
  }
}
