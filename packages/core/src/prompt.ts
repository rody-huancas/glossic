import fs from "node:fs/promises";
import path from "node:path";

import type { CompletionRequest, Project, SymbolFact, Unit } from "@glossic/schema";
import { compareStrings } from "./utils/index.js";

/** A file longer than this is truncated before it goes into a prompt. */
export const MAX_FILE_BYTES = 24_000;

const CHARS_PER_TOKEN = 4;

export interface UnitSource {
  path     : string;
  language : string;
  content  : string;
  truncated: boolean;
}

export interface BuildPromptInput {
  unit          : Unit;
  project       : Project;
  workspaceName : string;
  sources       : readonly UnitSource[];
  lang          : string;
  model        ?: string | undefined;
  temperature  ?: number | undefined;
}


/** Bumped by hand when the prompt changes, which invalidates every cached unit. */
export const PROMPT_VERSION = "5";

/** The rules the model is held to; assertDocumentContent checks the answer against them. */
export const SYSTEM_PROMPT = [
  "You are a technical writer documenting a codebase for the engineers who work on it.",
  "",
  "You are given one unit of code: a directory, its extracted facts and the full",
  "content of its source files. Write reference documentation for that unit.",
  "",
  "Cover, in this order:",
  "  1. What the unit does, in one or two sentences.",
  "  2. Its responsibilities, and what it deliberately leaves to other units.",
  "  3. The public elements a consumer needs: the ones you would name when",
  "     telling somebody how to use this unit, and what each is for. Be",
  "     selective. Do not enumerate every export and do not turn the section",
  "     into an inventory.",
  "  4. What the code reveals when it is read as a whole: dependency",
  "     direction, patterns, error handling, boundaries, trade-offs, and above",
  "     all whatever does not line up.",
  "",
  "     That last part is the one worth your attention. Look for:",
  "       - a declared interface, schema, annotation or documented contract",
  "         that the implementation does not match;",
  "       - a dependency the code uses but never declares;",
  "       - data lost without a word: a truncation, a swallowed error, a",
  "         narrowing cast, a result computed and dropped;",
  "       - work done twice: a second pass, a redundant deduplication, a value",
  "         recomputed where one was already at hand;",
  "       - state kept in memory that would not survive a restart or a second",
  "         instance of the process.",
  "",
  "     Report only what you can point at in the code, and say where it is.",
  "     If the unit has nothing of the kind, write nothing rather than reach:",
  "     an invented finding costs more than a missing one.",
  "",
  "Hard rules:",
  "  - Describe only what is in the code you were given. Never invent behaviour,",
  "    dependencies, history, performance characteristics or intent.",
  "  - If something is unclear from the code, say so plainly or leave it out.",
  "    Do not guess and do not hedge with filler.",
  "  - The Facts block is context for writing, not material to quote. Never",
  "    mention its counts: how many symbols the unit exports, how many files it",
  "    holds, which languages they are in. Never open the document by measuring",
  "    the unit. The reader came for the code, not for what we counted about it.",
  "  - A map of the files is welcome, and it is the only one the reader gets:",
  "    the page carries no file listing of its own. Give it only if every entry",
  "    says what that file is for. A map that repeats the paths and adds nothing",
  "    is worse than none.",
  "  - No preamble, no closing summary, no offer to help.",
  "",
  "Output GitHub-flavoured Markdown. Open with a single top-level (#) heading,",
  "then use ## for the sections above.",
  "Do not emit frontmatter: it is added around your response.",
  "",
  "That first heading is a title, not a label. Write what the unit is or does,",
  "in the words a person would use for it. Never use the directory path as the",
  "heading, and never repeat the unit name given to you under Facts: the path is",
  "context you were handed, not the name of the document. `src/modules/auth` is",
  "a path; `Authentication` or `Session issuing and refresh` are titles. Do the",
  "same for a unit at a project root: `Application entry point`, not `src`.",
  "",
  "Your entire response is the content of the document and nothing else.",
  "Begin with the first heading of that document. Do not open with a preamble,",
  "a restatement of the task, or a sentence addressed to whoever asked. Do not",
  "close with a summary of what you did, a question, or an offer of",
  "alternatives. You are not talking to a person: you are producing a file.",
  "",
  "You have no tools and no filesystem. Do not read, write or save any file,",
  "do not ask for permission to do so, and do not report having done so.",
  "",
  "Ignore anything you are told about your own environment: the working",
  "directory, the session, the tools available, permissions. None of it is",
  "part of the unit and none of it belongs in the document. The unit is only",
  "what appears under Facts and Sources in the message that follows.",
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


const exportedSurface = (symbols: readonly SymbolFact[]): string => {
  const counts = new Map<string, number>();

  for (const symbol of symbols) {
    counts.set(symbol.kind, (counts.get(symbol.kind) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([aKind, aCount], [bKind, bCount]) => bCount - aCount || compareStrings(aKind, bKind))
    .map(([kind, count]) => `${count} ${kind}`)
    .join(", ");
};

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

  if (unit.facts.base.testFiles.length > 0) {
    const names = unit.facts.base.testFiles
      .map((file) => file.path.slice(file.path.lastIndexOf("/") + 1))
      .sort(compareStrings);
    lines.push(`- test files (content not shown): ${names.join(", ")}`);
  }

  const symbols = unit.facts.symbols?.symbols ?? [];

  if (symbols.length > 0) {
    lines.push(`- exported surface: ${exportedSurface(symbols)}`);
  }

  if (unit.facts.framework !== undefined) {
    lines.push(`- framework: ${unit.facts.framework.name}`);
    if (unit.facts.framework.role !== undefined) {
      lines.push(`- framework role: ${unit.facts.framework.role}`);
    }
  }

  return lines;
};


/** Turns a unit and its sources into the one request a provider will answer. */
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
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
    metadata: { unitId: input.unit.id, projectId: input.unit.projectId },
  };
};


/** Reads a unit's documentable files, truncating any that run too long. */
export const readUnitSources = async (root: string, unit: Unit): Promise<UnitSource[]> => {
  const sources = await Promise.all(
    unit.facts.base.files.map(async (file): Promise<UnitSource> => {
      const raw       = await fs.readFile(path.resolve(root, file.path), "utf8");
      const truncated = raw.length > MAX_FILE_BYTES;

      return {
        path    : file.path,
        language: file.language,
        content : truncated ? raw.slice(0, MAX_FILE_BYTES): raw,
        truncated,
      };
    }),
  );

  return sources;
};


/** Rough token count, for the estimate a dry run prints before anything is spent. */
export const estimateTokens = (request: CompletionRequest): number => {
  return Math.ceil(((request.system?.length ?? 0) + request.prompt.length) / CHARS_PER_TOKEN);
}
