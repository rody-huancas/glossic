import path from "node:path";

import type { ScanResult } from "@glosik/core";
import { toPosix } from "@glosik/core";
import type { Manifest, Unit } from "@glosik/schema";

const plural = (count: number, singular: string): string =>
  `${count} ${count === 1 ? singular : `${singular}s`}`;

const dominantLanguage = (unit: Unit): string => unit.facts.base.languages[0]?.language ?? "-";

const countLanguages = (units: readonly Unit[]): Array<[string, number]> => {
  const totals = new Map<string, number>();
  for (const unit of units) {
    for (const entry of unit.facts.base.languages) {
      totals.set(entry.language, (totals.get(entry.language) ?? 0) + entry.count);
    }
  }

  return [...totals.entries()].sort(
    ([aLang, aCount], [bLang, bCount]) => bCount - aCount || (aLang < bLang ? -1 : 1),
  );
};

const workspaceHeadline = (manifest: Manifest): string => {
  const { workspace } = manifest;
  const kind = workspace.isMonorepo ? `${workspace.tool} monorepo` : "single project";
  const manager = workspace.packageManager;

  // The tool already names the package manager for pnpm workspaces.
  const suffix = manager === undefined || manager === workspace.tool ? "" : `, ${manager}`;
  return `${workspace.name} — ${kind}${suffix}`;
};

/**
 * Renders the scan report. Every list it walks is already sorted by
 * `buildManifest`, so the output only depends on the code that was scanned.
 */
export const renderScanReport = (result: ScanResult): string => {
  const { manifest } = result;
  const { units } = manifest;

  const nameWidth = Math.max(0, ...units.map((unit) => unit.name.length));
  const filesWidth = Math.max(
    0,
    ...units.map((unit) => plural(unit.facts.base.files.length, "file").length),
  );
  const languageWidth = Math.max(0, ...units.map((unit) => dominantLanguage(unit).length));

  const lines: string[] = [workspaceHeadline(manifest), ""];

  for (const project of manifest.workspace.projects) {
    const projectUnits = units.filter((unit) => unit.projectId === project.id);
    lines.push(`${project.name} (${project.rootDir})`);

    if (projectUnits.length === 0) {
      lines.push("  no source files");
      lines.push("");
      continue;
    }

    projectUnits.forEach((unit, index) => {
      const branch = index === projectUnits.length - 1 ? "└─" : "├─";
      const files = plural(unit.facts.base.files.length, "file");
      const columns = [
        unit.name.padEnd(nameWidth),
        files.padStart(filesWidth),
        dominantLanguage(unit).padEnd(languageWidth),
        unit.facts.base.roleHint ?? "",
      ];
      lines.push(`${branch} ${columns.join("  ")}`.trimEnd());
    });

    lines.push("");
  }

  const totalFiles = units.reduce((sum, unit) => sum + unit.facts.base.files.length, 0);
  lines.push(
    [
      plural(manifest.workspace.projects.length, "project"),
      plural(units.length, "unit"),
      plural(totalFiles, "file"),
    ].join(", "),
  );

  const languages = countLanguages(units);
  if (languages.length > 0) {
    lines.push(`languages: ${languages.map(([lang, count]) => `${lang} ${count}`).join(", ")}`);
  }

  return `${lines.join("\n")}\n`;
};

/** A path outside the cwd reads better absolute than as a pile of "../". */
export const displayPath = (cwd: string, target: string): string => {
  const relative = toPosix(path.relative(cwd, target));
  return relative === "" || relative.startsWith("..") ? toPosix(target) : relative;
};
