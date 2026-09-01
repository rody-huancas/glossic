import type { Manifest, Project, Unit } from "@glossic/schema";

import { compareStrings } from "./utils/index.js";

/** Where a unit's page goes, relative to the output directory. */
export const unitDocPath = (unit: Unit): string => {
  return unit.path === "." ? "root.md" : `${unit.path}.md`;
}

export const INDEX_DOC_PATH = "index.md";

const frontmatter = (entries: ReadonlyArray<readonly [string, string | number]>): string =>
  [
    "---",
    ...entries.map(([key, value]) =>
      typeof value === "number" ? `${key}: ${value}` : `${key}: ${JSON.stringify(value)}`,
    ),
    "---",
  ].join("\n");

export interface RenderUnitDocInput {
  unit       : Unit;
  project    : Project;
  body       : string;
  generatedAt: string;
}


/** One unit's page: frontmatter carrying the hash, then the prose the provider wrote. */
export const renderUnitDoc = (input: RenderUnitDocInput): string => {
  const { unit } = input;
  const title = unit.name === "root" ? input.project.name : unit.name;

  const entries: Array<readonly [string, string | number]> = [
    ["title", title],
    ["unit", unit.id],
    ["project", unit.projectId],
    ["path", unit.path],
    ["hash", unit.hash],
    ["files", unit.facts.base.files.length],
    ["generatedAt", input.generatedAt],
  ];

  if (unit.facts.base.roleHint !== null) {
    entries.splice(4, 0, ["role", unit.facts.base.roleHint]);
  }

  return [frontmatter(entries), "", input.body.trim(), ""].join("\n");
};

export interface RenderIndexDocInput {
  manifest   : Manifest;
  generatedAt: string;
}

const languageSummary = (units: readonly Unit[]): string => {
  const totals = new Map<string, number>();

  for (const unit of units) {
    for (const entry of unit.facts.base.languages) {
      totals.set(entry.language, (totals.get(entry.language) ?? 0) + entry.count);
    }
  }

  return [...totals.entries()]
    .sort(([aLang, aCount], [bLang, bCount]) => bCount - aCount || compareStrings(aLang, bLang))
    .map(([language, count]) => `${language} (${count})`)
    .join(", ");
};


/** The index page listing every unit in the workspace. */
export const renderIndexDoc = (input: RenderIndexDocInput): string => {
  const { manifest } = input;
  const { workspace, units } = manifest;

  const lines: string[] = [
    frontmatter([
      ["title", workspace.name],
      ["generatedAt", input.generatedAt],
      ["units", units.length],
    ]),
    "",
    `# ${workspace.name}`,
    "",
    workspace.isMonorepo
      ? `${workspace.tool} monorepo with ${workspace.projects.length} projects.`
      : "Single-project workspace.",
    "",
  ];

  for (const project of workspace.projects) {
    const projectUnits = units.filter((unit) => unit.projectId === project.id);

    lines.push(`## ${project.name}`, "");

    if (projectUnits.length === 0) {
      lines.push("No documented units.", "");
      continue;
    }

    for (const unit of projectUnits) {
      const role   = unit.facts.base.roleHint;
      const suffix = role === null ? "" : ` — ${role}`;

      lines.push(
        `- [${unit.name}](./${unitDocPath(unit)}) — ${unit.facts.base.files.length} files${suffix}`,
      );
    }
    lines.push("");
  }

  const languages = languageSummary(units);

  if (languages !== "") {
    lines.push(`Languages: ${languages}`, "");
  }

  return lines.join("\n");
};
