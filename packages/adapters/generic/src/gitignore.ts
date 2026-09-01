import fs from "node:fs/promises";
import path from "node:path";
import ignore, { type Ignore } from "ignore";
import { glob } from "tinyglobby";

interface GitignoreScope {
  base: string;
  matcher: Ignore;
}

const readScope = async (root: string, base: string): Promise<GitignoreScope | undefined> => {
  const file = path.join(root, base, ".gitignore");
  try {
    const content = await fs.readFile(file, "utf8");
    return { base, matcher: ignore().add(content) };
  } catch {
    return undefined;
  }
};


export const collectGitignores = async (root: string, projectDir: string, hardIgnores: readonly string[]): Promise<GitignoreScope[]> => {
  const found = await glob({
    patterns           : ["**/.gitignore"],
    cwd                : path.join(root, projectDir),
    ignore             : [...hardIgnores],
    onlyFiles          : true,
    followSymbolicLinks: false,
    dot                : true,
  });

  const bases = new Set<string>([""]);

  for (const entry of found) {
    const dir = path.posix.dirname(entry.split(path.sep).join("/"));
    bases.add(joinBase(projectDir, dir === "." ? "" : dir));
  }

  bases.add(projectDir === "." ? "" : projectDir);

  const scopes = await Promise.all([...bases].sort().map((base) => readScope(root, base)));
  return scopes.filter((scope): scope is GitignoreScope => scope !== undefined);
};

const joinBase = (projectDir: string, sub: string): string => {
  const prefix = projectDir === "." ? "" : projectDir;

  if (prefix === "") {
    return sub;
  }

  return sub === "" ? prefix : `${prefix}/${sub}`;
};


export const createGitignoreFilter = (scopes: readonly GitignoreScope[]): ((relativePath: string) => boolean) => {
  return (relativePath: string): boolean => {
    for (const scope of scopes) {
      if (scope.base === "") {
        if (scope.matcher.ignores(relativePath)) {
          return true;
        }

        continue;
      }

      const prefix = `${scope.base}/`;

      if (!relativePath.startsWith(prefix)) {
        continue;
      }

      if (scope.matcher.ignores(relativePath.slice(prefix.length))) {
        return true;
      }
    }
    return false;
  };
};
