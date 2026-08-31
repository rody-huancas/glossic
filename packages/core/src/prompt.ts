import fs from "node:fs/promises";
import path from "node:path";

import type { CompletionRequest, Project, Unit } from "@glosik/schema";

import { compareStrings } from "./order.js";

/** Files larger than this are truncated so one big file cannot eat the window. */
export const MAX_FILE_BYTES = 24_000;

/** Rough chars-per-token ratio, only used by `--dry-run` estimates. */
const CHARS_PER_TOKEN = 4;

export interface UnitSource {
  /** Posix path relative to the workspace root. */
  path: string;
  language: string;
  content: string;
  truncated: boolean;
}

export interface BuildPromptInput {
  unit: Unit;
  project: Project;
  workspaceName: string;
  sources: readonly UnitSource[];
  /** ISO 639-1 code the documentation must be written in. */
  lang: string;
}

export const SYSTEM_PROMPT = [
  "You are a technical writer documenting a codebase for the engineers who work on it.",
  "",
  "You are given one unit of code: a directory, its extracted facts and the full",
  "content of its source files. Write reference documentation for that unit.",
  "",
  "Cover, in this order:",
  "  1. What the unit does, in one or two sentences.",
  "  2. Its responsibilities, and what it deliberately leaves to other units.",
  "  3. The important public elements (exported classes, functions, types,",
  "     endpoints, commands) and what each is for.",
  "  4. Architectural decisions that are visible in the code: dependency",
  "     direction, patterns, error handling, boundaries, notable trade-offs.",
  "",
  "Hard rules:",
  "  - Describe only what is in the code you were given. Never invent behaviour,",
  "    dependencies, history, performance characteristics or intent.",
  "  - If something is unclear from the code, say so plainly or leave it out.",
  "    Do not guess and do not hedge with filler.",
  "  - Do not restate the file listing; the reader already has it.",
  "  - No preamble, no closing summary, no offer to help.",
  "",
  "Output GitHub-flavoured Markdown starting at heading level 2 (##).",
  "Do not emit a top-level (#) heading and do not emit frontmatter.",
].join("\n");

const fence = (source: UnitSource): string =>
  [
    `#### ${source.path}${source.truncated ? " (truncated)" : ""}`,
    "",
    `\`\`\`${source.language}`,
    source.content,
    "```",
    "",
  ].join("\n");

const factLines = (unit: Unit): string[] => {
  const lines = [
    `- unit: ${unit.name}`,
    `- path: ${unit.path}`,
    `- files: ${unit.facts.base.files.length}`,
    `- languages: ${unit.facts.base.languages
      .map((entry) => `${entry.language} (${entry.count})`)
      .join(", ")}`,
  ];

  if (unit.facts.base.roleHint !== null) {
    lines.push(`- folder role hint: ${unit.facts.base.roleHint}`);
  }

  if (unit.facts.symbols !== undefined) {
    const names = unit.facts.symbols.symbols
      .map((symbol) => `${symbol.kind} ${symbol.name}`)
      .sort(compareStrings);
    lines.push(`- symbols: ${names.join(", ")}`);
  }

  if (unit.facts.framework !== undefined) {
    lines.push(`- framework: ${unit.facts.framework.name}`);
    if (unit.facts.framework.role !== undefined) {
      lines.push(`- framework role: ${unit.facts.framework.role}`);
    }
  }

  return lines;
};

/** Builds the completion request for one unit. Pure: sources are read upfront. */
export const buildUnitPrompt = (input: BuildPromptInput): CompletionRequest => {
  const prompt = [
    `Workspace: ${input.workspaceName}`,
    `Project: ${input.project.name} (${input.project.rootDir})`,
    "",
    "## Facts",
    "",
    ...factLines(input.unit),
    "",
    "## Sources",
    "",
    ...input.sources.map(fence),
    `Write the documentation in ${input.lang}.`,
  ].join("\n");

  return {
    system: SYSTEM_PROMPT,
    prompt,
    metadata: { unitId: input.unit.id, projectId: input.unit.projectId },
  };
};

/** Reads every source file of a unit, in manifest order. */
export const readUnitSources = async (root: string, unit: Unit): Promise<UnitSource[]> => {
  const sources = await Promise.all(
    unit.facts.base.files.map(async (file): Promise<UnitSource> => {
      const raw = await fs.readFile(path.resolve(root, file.path), "utf8");
      const truncated = raw.length > MAX_FILE_BYTES;
      return {
        path: file.path,
        language: file.language,
        content: truncated ? raw.slice(0, MAX_FILE_BYTES) : raw,
        truncated,
      };
    }),
  );

  return sources;
};

/**
 * Cheap token estimate for `--dry-run`. Deliberately approximate: it exists to
 * give an order of magnitude before spending money, not to bill anyone.
 */
export const estimateTokens = (request: CompletionRequest): number =>
  Math.ceil(((request.system?.length ?? 0) + request.prompt.length) / CHARS_PER_TOKEN);
