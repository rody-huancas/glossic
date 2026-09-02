import type { Manifest, Unit } from "@glossic/schema";

import { siteStrings } from "./site-strings.js";
import { slugFor } from "./sidebar.js";

/** Where the structure page lives, and how the sidebar addresses it. */
export const STRUCTURE_SLUG = "structure";

/** What the landing page says about the project, all of it out of the manifest. */
export interface SiteStats {
  projects   : number;
  units      : number;
  files      : number;
  languages  : Array<{ language: string; count: number }>;
  generatedAt: string;
}

/** The language most of a unit's files are written in. */
const dominantLanguage = (unit: Unit): string =>
  unit.facts.base.languages[0]?.language ?? "-";

/**
 * The totals the landing page shows. Counted from the manifest rather than from
 * the pages on disk, so the numbers are the ones the scan actually found.
 */
export const siteStats = (manifest: Manifest): SiteStats => {
  const totals = new Map<string, number>();
  let files    = 0;

  for (const unit of manifest.units) {
    files += unit.facts.base.files.length;

    for (const entry of unit.facts.base.languages) {
      totals.set(entry.language, (totals.get(entry.language) ?? 0) + entry.count);
    }
  }

  const languages = [...totals.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count || (a.language < b.language ? -1 : 1));

  return {
    projects   : manifest.workspace.projects.length,
    units      : manifest.units.length,
    files,
    languages,
    generatedAt: manifest.generatedAt,
  };
};

/** The date alone. The time of day tells a reader nothing. */
const asDate = (iso: string): string => iso.slice(0, 10);

/** Directory names that hold the code itself, rather than what surrounds it. */
const CODE_ROOTS = ["src", "lib", "app"];

/**
 * Where "Get started" should land: the unit that holds the code, not whatever
 * the manifest happened to sort first. A repository whose first unit is
 * `scripts` would otherwise open on its build tooling.
 *
 * The code root wins when there is one -- `src`, `lib` or `app`, shallowest
 * first so a project root beats a nested namesake. Failing that, the unit with
 * the most documentable files, which is the closest thing to a centre of
 * gravity a manifest can offer. Ties keep manifest order, so the answer does
 * not move between runs.
 */
export const startUnit = (manifest: Manifest, documented?: ReadonlySet<string>): Unit | undefined => {
  const units = manifest.units.filter((unit) => documented === undefined || documented.has(unit.id));

  if (units.length === 0) return undefined;

  const depth = (unit: Unit): number => unit.path.split("/").length;

  const roots = units
    .filter((unit) => CODE_ROOTS.includes((unit.path.split("/").at(-1) ?? "").toLowerCase()))
    .sort((a, b) => depth(a) - depth(b));

  if (roots[0] !== undefined) return roots[0];

  return units.reduce((best, unit) =>
    unit.facts.base.files.length > best.facts.base.files.length ? unit : best,
  );
};

/** The slug "Get started" points at, or undefined when there is nothing to point at. */
export const startSlug = (manifest: Manifest, documented?: ReadonlySet<string>): string | undefined => {
  const unit = startUnit(manifest, documented);

  return unit === undefined ? undefined : slugFor(unit);
};

/**
 * The same tree `glossic scan` prints, as a page: one table per project, its
 * units in manifest order, with the file count and the language most of the
 * unit is written in.
 *
 * It reads the manifest and nothing else, so it describes the code that was
 * scanned rather than the pages that happened to be generated.
 */
export const structurePage = (manifest: Manifest, lang: string): string => {
  const s     = siteStrings(lang);
  const stats = siteStats(manifest);

  const lines = [
    "---",
    `title: ${JSON.stringify(s.structure)}`,
    `description: ${JSON.stringify(
      `${stats.units} ${s.modules}, ${stats.files} ${s.files.toLowerCase()}, ${s.generated} ${asDate(stats.generatedAt)}`,
    )}`,
    "---",
    "",
  ];

  for (const project of manifest.workspace.projects) {
    const units = manifest.units.filter((unit) => unit.projectId === project.id);

    if (units.length === 0) continue;

    if (manifest.workspace.projects.length > 1) {
      lines.push(`## ${project.name}`, "");
    }

    lines.push(
      `| ${s.directory} | ${s.files} | ${s.language} |`,
      "| --- | ---: | --- |",
      ...units.map(
        (unit) =>
          `| [${unit.path}](/${slugFor(unit)}/) | ${unit.facts.base.files.length} | ${dominantLanguage(unit)} |`,
      ),
      "",
    );
  }

  return lines.join("\n");
};
