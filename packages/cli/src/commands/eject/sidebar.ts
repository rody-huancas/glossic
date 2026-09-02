import { unitDocPath } from "@glossic/core";
import type { Manifest, Project, Unit } from "@glossic/schema";

import { titleCase } from "./titles.js";

/** One page. `slug` is how Starlight addresses a content entry. */
export interface SidebarEntry {
  label: string;
  slug : string;
}

/** A folder of pages, or of more folders. */
export interface SidebarGroup {
  label: string;
  items: SidebarNode[];
}

export type SidebarNode = SidebarEntry | SidebarGroup;

export const isGroup = (node: SidebarNode): node is SidebarGroup => "items" in node;

/**
 * Astro lowercases every segment when it derives a slug from a filename, so a
 * unit under `src/Modules` is addressed as `src/modules`.
 */
export const slugFor = (unit: Unit): string => {
  return unitDocPath(unit).replace(/\.md$/, "").toLowerCase();
};

/** The unit's path with the project's own directory taken off the front. */
const withinProject = (unit: Unit, project: Project): string => {
  if (project.rootDir === "." || project.rootDir === "") {
    return unit.path;
  }

  const prefix = `${project.rootDir}/`;

  return unit.path.startsWith(prefix) ? unit.path.slice(prefix.length) : unit.path;
};

/** The directory a unit sits in, relative to its project. "" at the project root. */
const parentOf = (relative: string): string => {
  const at = relative.lastIndexOf("/");

  return at === -1 ? "" : relative.slice(0, at);
};

/**
 * Groups a project's pages by the directory they share, keeping the order the
 * manifest gave them.
 *
 * Three rules keep the result readable rather than merely correct. A directory
 * holding one page is not worth a folder the reader has to open, so its page
 * moves up a level. Pages at the project root were never inside a directory to
 * begin with, so they stay at the top. And a directory that has both a page of
 * its own and children puts its own page first inside its group, rather than
 * leaving two entries with the same name as siblings.
 */
const groupByDirectory = (
  units  : readonly Unit[],
  labels : ReadonlyMap<string, string>,
  project: Project,
): SidebarNode[] => {
  const pages: Array<{ relative: string; entry: SidebarEntry }> = [];

  for (const unit of units) {
    const label = labels.get(unit.id);

    if (label === undefined) continue;

    pages.push({
      relative: withinProject(unit, project),
      entry   : { label, slug: slugFor(unit) },
    });
  }

  const children = new Map<string, SidebarEntry[]>();

  for (const { relative, entry } of pages) {
    const parent = parentOf(relative);

    if (parent === "") continue;

    children.set(parent, [...(children.get(parent) ?? []), entry]);
  }

  const folders = new Set(
    [...children].filter(([, kids]) => kids.length > 1).map(([directory]) => directory),
  );

  const nodes: SidebarNode[] = [];
  const placed               = new Set<SidebarEntry>();

  const folderNode = (directory: string, own?: SidebarEntry): SidebarGroup => {
    const kids = children.get(directory) ?? [];

    for (const kid of kids) placed.add(kid);
    if (own !== undefined) placed.add(own);

    return {
      label: titleCase(directory.split("/").at(-1) ?? directory),
      items: own === undefined ? kids : [own, ...kids],
    };
  };

  for (const { relative, entry } of pages) {
    if (placed.has(entry)) continue;

    if (folders.has(relative)) {
      nodes.push(folderNode(relative, entry));
      continue;
    }

    const parent = parentOf(relative);

    if (folders.has(parent)) {
      nodes.push(folderNode(parent));
      continue;
    }

    nodes.push(entry);
    placed.add(entry);
  }

  return nodes;
};

/**
 * The navigation, straight from the manifest: the directory hierarchy the
 * project actually has, in the order the manifest lists it. Reading the docs
 * directory instead would sort by whatever the filesystem returned and would
 * not know which project a page belongs to.
 *
 * A workspace with a single project skips the project level, which would
 * otherwise be one folder wrapping everything and telling the reader nothing.
 */
export const buildSidebar = (
  manifest: Manifest,
  labels  : ReadonlyMap<string, string>,
): SidebarNode[] => {
  const projects = manifest.workspace.projects;
  const nodes: SidebarNode[] = [];

  for (const project of projects) {
    const units = manifest.units.filter((unit) => unit.projectId === project.id);
    const inner = groupByDirectory(units, labels, project);

    if (inner.length === 0) continue;

    if (projects.length === 1) {
      nodes.push(...inner);
      continue;
    }

    nodes.push({ label: project.name, items: inner });
  }

  return nodes;
};

/** Every page the sidebar links to, in the order it shows them. */
export const sidebarEntries = (nodes: readonly SidebarNode[]): SidebarEntry[] => {
  return nodes.flatMap((node) => (isGroup(node) ? sidebarEntries(node.items) : [node]));
};

/**
 * The sidebar as it appears in astro.config.mjs, indented for where it sits in
 * that file. Written out rather than JSON.stringify'd so the generated config
 * reads like something a person wrote and can be edited by hand.
 */
export const renderSidebar = (nodes: readonly SidebarNode[], indent = 6): string => {
  if (nodes.length === 0) return "[]";

  const render = (node: SidebarNode, pad: string): string[] => {
    if (!isGroup(node)) {
      return [`${pad}{ label: ${JSON.stringify(node.label)}, slug: ${JSON.stringify(node.slug)} },`];
    }

    return [
      `${pad}{`,
      `${pad}  label: ${JSON.stringify(node.label)},`,
      `${pad}  items: [`,
      ...node.items.flatMap((child) => render(child, `${pad}    `)),
      `${pad}  ],`,
      `${pad}},`,
    ];
  };

  const pad = " ".repeat(indent);

  return ["[", ...nodes.flatMap((node) => render(node, `${pad}  `)), `${pad}]`].join("\n");
};
