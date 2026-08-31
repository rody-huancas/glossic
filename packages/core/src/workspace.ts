import path from "node:path";
import type { Project, Workspace, WorkspaceTool } from "@glossic/schema";
import { glob } from "tinyglobby";
import { parse as parseYaml } from "yaml";

import { pathExists, readJson, readText } from "./fs-utils.js";
import { sortBy } from "./order.js";
import { toPosix } from "./paths.js";

interface PackageJson {
  name?: string;
  packageManager?: string;
  workspaces?: string[] | { packages?: string[] };
}

interface MonorepoMarker {
  tool: WorkspaceTool;
  globs: string[];
}

/** Never treated as a project directory, whatever the workspace globs say. */
const GLOB_IGNORES = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**"];

const LOCKFILE_PACKAGE_MANAGERS: ReadonlyArray<readonly [string, string]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["package-lock.json", "npm"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["composer.lock", "composer"],
  ["composer.json", "composer"],
];

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Reads the `packageManager` field, falling back to whichever lockfile is present. */
const detectPackageManager = async (
  dir: string,
  pkg: PackageJson | undefined,
): Promise<string | undefined> => {
  const declared = pkg?.packageManager;
  if (typeof declared === "string" && declared.length > 0) {
    const [name] = declared.split("@");
    if (name !== undefined && name.length > 0) return name;
  }

  for (const [lockfile, manager] of LOCKFILE_PACKAGE_MANAGERS) {
    if (await pathExists(path.join(dir, lockfile))) return manager;
  }

  return undefined;
};

/**
 * Looks for a monorepo declaration. The order is fixed and part of the
 * contract: pnpm, package.json workspaces, turbo, nx, lerna.
 */
const detectMonorepo = async (
  root: string,
  pkg: PackageJson | undefined,
): Promise<MonorepoMarker | undefined> => {
  const pnpmWorkspace = await readText(path.join(root, "pnpm-workspace.yaml"));
  if (pnpmWorkspace !== undefined) {
    const parsed: unknown = parseYaml(pnpmWorkspace);
    const globs = asStringArray((parsed as { packages?: unknown } | null)?.packages);
    if (globs.length > 0) return { tool: "pnpm", globs };
  }

  const workspaces = Array.isArray(pkg?.workspaces)
    ? pkg.workspaces
    : asStringArray(pkg?.workspaces?.packages);
  if (workspaces.length > 0) return { tool: "npm-workspaces", globs: workspaces };

  if (await pathExists(path.join(root, "turbo.json"))) {
    return { tool: "turbo", globs: ["apps/*", "packages/*"] };
  }

  if (await pathExists(path.join(root, "nx.json"))) {
    return { tool: "nx", globs: ["apps/*", "libs/*", "packages/*"] };
  }

  const lerna = await readJson<{ packages?: unknown }>(path.join(root, "lerna.json"));
  if (lerna !== undefined) {
    const globs = asStringArray(lerna.packages);
    return { tool: "lerna", globs: globs.length > 0 ? globs : ["packages/*"] };
  }

  return undefined;
};

/**
 * Expands workspace globs into project directories. A directory only counts as
 * a project when it holds a package.json, which is what every supported
 * workspace tool means by "package".
 */
const expandProjectDirs = async (root: string, globs: string[]): Promise<string[]> => {
  const patterns: string[] = [];
  const ignore = [...GLOB_IGNORES];

  for (const entry of globs) {
    if (entry.startsWith("!")) {
      ignore.push(`${entry.slice(1)}/**`);
      continue;
    }
    patterns.push(`${entry}/package.json`);
  }

  if (patterns.length === 0) return [];

  const manifests = await glob({
    patterns,
    cwd: root,
    ignore,
    onlyFiles: true,
    followSymbolicLinks: false,
    dot: false,
  });

  const dirs = manifests.map((manifest) => toPosix(path.posix.dirname(toPosix(manifest))));
  return [...new Set(dirs)].sort();
};

const buildProject = async (
  root: string,
  rootDir: string,
  fallbackManager: string | undefined,
): Promise<Project> => {
  const dir = path.resolve(root, rootDir);
  const pkg = await readJson<PackageJson>(path.join(dir, "package.json"));
  const packageManager = (await detectPackageManager(dir, pkg)) ?? fallbackManager;
  const name = pkg?.name ?? path.basename(dir);

  const project: Project = {
    id: rootDir === "." ? "root" : rootDir,
    name,
    rootDir,
  };

  return packageManager === undefined ? project : { ...project, packageManager };
};

/**
 * Resolves the workspace at `root`: its projects, the tool that declares them
 * and the package manager in use. Falls back to a single project rooted at
 * `root` when no monorepo marker is found.
 */
export const resolveWorkspace = async (root: string): Promise<Workspace> => {
  const absoluteRoot = path.resolve(root);
  const pkg = await readJson<PackageJson>(path.join(absoluteRoot, "package.json"));
  const packageManager = await detectPackageManager(absoluteRoot, pkg);
  const name = pkg?.name ?? path.basename(absoluteRoot);

  const marker = await detectMonorepo(absoluteRoot, pkg);
  const projectDirs =
    marker === undefined ? [] : await expandProjectDirs(absoluteRoot, marker.globs);

  const isMonorepo = projectDirs.length > 0;
  const rootDirs = isMonorepo ? projectDirs : ["."];
  const projects = await Promise.all(
    rootDirs.map((rootDir) => buildProject(absoluteRoot, rootDir, packageManager)),
  );

  const workspace: Workspace = {
    name,
    // Posix even on Windows: the manifest must not depend on the host separator.
    root: toPosix(absoluteRoot),
    isMonorepo,
    tool: isMonorepo && marker !== undefined ? marker.tool : "none",
    projects: sortBy(projects, (project) => project.id),
  };

  return packageManager === undefined ? workspace : { ...workspace, packageManager };
};
