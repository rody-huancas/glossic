import type { ScanResult } from "@glossic/core";
import type { Manifest, Unit } from "@glossic/schema";

import { counted } from "./shared.js";
import { defaultTranslator } from "../i18n/index.js";
import type { Translator } from "../i18n/index.js";

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

/** The tool already names the package manager for pnpm workspaces. */
const workspaceHeadline = (manifest: Manifest, t: Translator): string => {
  const { workspace } = manifest;
  const kind = workspace.isMonorepo
    ? t("scan.monorepo", { tool: workspace.tool })
    : t("scan.singleProject");
  const manager = workspace.packageManager;

  const suffix = manager === undefined || manager === workspace.tool ? "" : `, ${manager}`;
  return `${workspace.name} — ${kind}${suffix}`;
};

/**
 * Renders the scan report. Every list it walks is already sorted by
 * `buildManifest`, so the output only depends on the code that was scanned.
 */
export const renderScanReport = (result: ScanResult, t: Translator = defaultTranslator): string => {
  const { manifest } = result;
  const { units } = manifest;

  const nameWidth = Math.max(0, ...units.map((unit) => unit.name.length));
  const filesWidth = Math.max(
    0,
    ...units.map((unit) => counted(t, unit.facts.base.files.length, "file").length),
  );
  const languageWidth = Math.max(0, ...units.map((unit) => dominantLanguage(unit).length));

  const lines: string[] = [workspaceHeadline(manifest, t), ""];

  for (const project of manifest.workspace.projects) {
    const projectUnits = units.filter((unit) => unit.projectId === project.id);
    lines.push(`${project.name} (${project.rootDir})`);

    if (projectUnits.length === 0) {
      lines.push(`  ${t("scan.noSourceFiles")}`);
      lines.push("");
      continue;
    }

    projectUnits.forEach((unit, index) => {
      const branch = index === projectUnits.length - 1 ? "└─" : "├─";
      const columns = [
        unit.name.padEnd(nameWidth),
        counted(t, unit.facts.base.files.length, "file").padStart(filesWidth),
        dominantLanguage(unit).padEnd(languageWidth),
        unit.facts.base.roleHint ?? "",
      ];
      lines.push(`${branch} ${columns.join("  ")}`.trimEnd());
    });

    lines.push("");
  }

  const totalFiles = units.reduce((sum, unit) => sum + unit.facts.base.files.length, 0);
  lines.push(
    t("scan.summary", {
      projects: counted(t, manifest.workspace.projects.length, "project"),
      units   : counted(t, units.length, "unit"),
      files   : counted(t, totalFiles, "file"),
    }),
  );

  const languages = countLanguages(units);
  if (languages.length > 0) {
    lines.push(
      t("scan.languages", {
        list: languages.map(([lang, count]) => `${lang} ${count}`).join(", "),
      }),
    );
  }

  return `${lines.join("\n")}\n`;
};
