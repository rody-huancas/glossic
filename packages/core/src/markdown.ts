import type { Manifest, Project, Unit } from "@glosik/schema";

import { compareStrings } from "./order.js";

/** Doc path of a unit, relative to the docs root. Mirrors the source tree. */
export const unitDocPath = (unit: Unit): string =>
  unit.path === "." ? "root.md" : `${unit.path}.md`;

/** Name of the generated index, relative to the docs root. */
export const INDEX_DOC_PATH = "index.md";

/**
 * Frontmatter values are emitted as JSON scalars, which are valid YAML
 * double-quoted strings and need no separate escaping pass.
 */
const frontmatter = (entries: ReadonlyArray<readonly [string, string | number]>): string =>
  [
    "---",
    ...entries.map(([key, value]) =>
      typeof value === "number" ? `${key}: ${value}` : `${key}: ${JSON.stringify(value)}`,
    ),
    "---",
  ].join("\n");

export interface RenderUnitDocInput {
  unit: Unit;
  project: Project;
  /** Markdown produced by the provider, starting at heading level 2. */
  body: string;
  generatedAt: string;
}

/**
 * Renders one unit document: Starlight/Docusaurus-compatible frontmatter plus
 * the model's prose. Nothing here is model-generated except `body`.
 */
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

  return [frontmatter(entries), "", `# ${title}`, "", input.body.trim(), ""].join("\n");
};

export interface RenderIndexDocInput {
  manifest: Manifest;
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

/** Renders the root index: one linked entry per unit, grouped by project. */
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
      const role = unit.facts.base.roleHint;
      const suffix = role === null ? "" : ` — ${role}`;
      lines.push(
        `- [${unit.name}](./${unitDocPath(unit)}) — ${unit.facts.base.files.length} files${suffix}`,
      );
    }
    lines.push("");
  }

  const languages = languageSummary(units);
  if (languages !== "") lines.push(`Languages: ${languages}`, "");

  return lines.join("\n");
};
