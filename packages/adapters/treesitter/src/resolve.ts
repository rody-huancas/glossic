import path from "node:path";

/** Extensions a specifier without one can be pointing at, in the order they win. */
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"] as const;

/**
 * TypeScript under `verbatimModuleSyntax` imports a module by the name of the
 * JavaScript it compiles to, so `./hash.js` is how a file names `hash.ts`.
 */
const REWRITES: Readonly<Record<string, readonly string[]>> = {
  ".cjs": [".cts", ".cjs"],
  ".js" : [".ts", ".tsx", ".js", ".jsx"],
  ".jsx": [".tsx", ".jsx"],
  ".mjs": [".mts", ".mjs"],
};


/** Whether the specifier names a file rather than a package. */
export const isRelative = (specifier: string): boolean => {
  return specifier.startsWith("./") || specifier.startsWith("../");
};


/** Every file a specifier could mean, most specific first. */
export const candidatePaths = (target: string): string[] => {
  const extension = path.posix.extname(target);
  const rewrites  = REWRITES[extension];

  if (rewrites !== undefined) {
    const base = target.slice(0, -extension.length);

    return rewrites.map((one) => `${base}${one}`);
  }

  return [
    ...(extension === "" ? [] : [target]),
    ...EXTENSIONS.map((one) => `${target}${one}`),
    ...EXTENSIONS.map((one) => `${target}/index${one}`),
  ];
};


/**
 * The unit that owns the file a specifier points at, or undefined when nothing
 * in the workspace does -- which is every specifier that leaves it.
 */
export const resolveSpecifier = (importer: string, specifier: string, units: ReadonlyMap<string, string>): string | undefined => {
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));

  for (const candidate of candidatePaths(target)) {
    const unit = units.get(candidate);

    if (unit !== undefined) return unit;
  }

  return undefined;
};
