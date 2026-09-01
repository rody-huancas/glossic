import { ProviderError } from "@glossic/schema";

/**
 * Shorter than this and the model did not write a document: it wrote a note
 * about the document. The shortest real unit doc glossic produces runs to a
 * few hundred characters.
 */
export const MIN_DOCUMENT_LENGTH = 200;

/**
 * A sentence of throat-clearing before the first heading is normal and cheap
 * to drop. Half a kilobyte of it is not context, it is a conversation.
 */
export const MAX_PREAMBLE_LENGTH = 500;

interface ContentRule {
  /** Named so the failure tells the user what the model actually did. */
  reason: string;
  pattern: RegExp;
}

/**
 * A completion provider that is really an agent answers the operator instead
 * of writing the document. These are the shapes that came back in practice,
 * matched narrowly so ordinary prose about a codebase survives.
 *
 * Most specific first: the reason is what the user reads in the failure line.
 */
const CONVERSATIONAL_RULES: readonly ContentRule[] = [
  {
    reason: "the model asked for permission instead of writing the document",
    pattern:
      /\b(permission to (write|save|create)|(write|read) permission|need (write )?access)\b/i,
  },
  {
    reason: "the model reported on saving a file instead of writing the document",
    pattern:
      /\bI( have|['’]ve)? ?(drafted|prepared|written|created|saved|generated) (the|this|a) /i,
  },
  {
    reason: "the model asked the reader a question",
    pattern: /\b(let me know|say the word|shall I|would you (like|prefer|want))\b/i,
  },
  {
    reason: "the model opened with a preamble instead of the document",
    pattern: /^\s*(here(['’]s| is)|below is|sure[,!]|certainly[,!]|I['’]ll)\b/i,
  },
  {
    reason: "the model addressed the reader in the first person",
    pattern: /\bI['’](ve|m|ll|d)\b/,
  },
  {
    reason: "the model addressed the reader in the first person",
    pattern: /\bI (need|cannot|can't|could not|couldn't|have|am|was|tried|noticed|assume)\b/,
  },
];

const FENCE = /^\s{0,3}(```|~~~)/;
const HEADING = /^(\s{0,3})(#{1,6})(\s+\S)/;
const TOP_HEADING = /^\s{0,3}#{1,2}\s+\S/;

interface SourceLine {
  text: string;
  /** Inside a fenced code block, where a leading "#" is a comment, not a heading. */
  fenced: boolean;
}

const scanLines = (text: string): SourceLine[] => {
  const lines: SourceLine[] = [];
  let fence: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    const match = FENCE.exec(line);

    if (fence === undefined) {
      if (match !== null) fence = match[1];
      lines.push({ text: line, fenced: match !== null });
      continue;
    }

    lines.push({ text: line, fenced: true });
    if (match !== null && match[1] === fence) fence = undefined;
  }

  return lines;
};

/** Shifts every heading down one level, clamping at h6. */
const demoteHeadings = (lines: readonly SourceLine[]): string[] =>
  lines.map((line) => {
    if (line.fenced) return line.text;

    const match = HEADING.exec(line.text);
    if (match === null) return line.text;

    const [, indent = "", hashes = "", rest = ""] = match;
    const level = Math.min(hashes.length + 1, 6);
    return `${indent}${"#".repeat(level)}${rest}${line.text.slice(match[0].length)}`;
  });

export interface NormalizedDocument {
  /** The document, preamble removed and heading levels normalized. */
  body: string;
  /** What was dropped before the first heading, when anything was. */
  preamble: string | undefined;
}

const invalidContent = (providerName: string, reason: string, detail: string): ProviderError =>
  new ProviderError({
    provider: providerName,
    code: "invalid-content",
    message: `the response is not a document: ${reason}`,
    detail,
  });

/** Collapses whitespace so an excerpt fits on one line. */
export const excerpt = (text: string, limit: number): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
};

/**
 * Turns a raw completion into a document body.
 *
 * The Claude Code CLI puts the working directory and git status in the system
 * prompt even when glossic replaces it, and the model keeps explaining why it
 * cannot see a repository before getting on with the job. One sentence of that
 * is noise worth dropping; a page of it is a conversation, not a document.
 *
 * The frontmatter already carries the document's title, so a body that opens
 * at h1 would give the page two. Every heading shifts down one level in that
 * case, which keeps the hierarchy intact without trusting the model to obey.
 */
export const normalizeDocument = (providerName: string, text: string): NormalizedDocument => {
  const lines = scanLines(text);
  const first = lines.findIndex((line) => !line.fenced && TOP_HEADING.test(line.text));

  if (first === -1) {
    throw invalidContent(
      providerName,
      "it contains no markdown heading",
      excerpt(text, 120) || "(empty)",
    );
  }

  const dropped = lines
    .slice(0, first)
    .map((line) => line.text)
    .join("\n")
    .trim();

  if (dropped.length > MAX_PREAMBLE_LENGTH) {
    throw invalidContent(
      providerName,
      `${dropped.length} characters of prose precede the first heading, over the ${MAX_PREAMBLE_LENGTH} limit`,
      excerpt(dropped, 120),
    );
  }

  const kept = lines.slice(first);
  const startsAtH1 = /^\s{0,3}#\s/.test(kept[0]?.text ?? "");
  const body = (startsAtH1 ? demoteHeadings(kept) : kept.map((line) => line.text))
    .join("\n")
    .trim();

  return { body, preamble: dropped === "" ? undefined : dropped };
};

export interface ContentProblem {
  reason: string;
  /** The offending snippet, so the failure line is actionable. */
  excerpt: string;
}

const excerptAround = (text: string, index: number): string => {
  const start = Math.max(0, index - 30);
  return excerpt(text.slice(start, Math.min(text.length, index + 90)), 200);
};

/** Returns what is wrong with a generated document, or undefined when it is fine. */
export const findContentProblem = (text: string): ContentProblem | undefined => {
  const trimmed = text.trim();

  if (trimmed.length < MIN_DOCUMENT_LENGTH) {
    return {
      reason: `the response is ${trimmed.length} characters, below the ${MIN_DOCUMENT_LENGTH} minimum`,
      excerpt: excerpt(trimmed, 120),
    };
  }

  for (const rule of CONVERSATIONAL_RULES) {
    const match = rule.pattern.exec(trimmed);
    if (match !== null) {
      return { reason: rule.reason, excerpt: excerptAround(trimmed, match.index) };
    }
  }

  return undefined;
};

/**
 * Guards the write: a document that reads like a chat reply must never reach
 * disk. The unit fails, stays out of the cache, and the next run retries it.
 */
export const assertDocumentContent = (providerName: string, text: string): void => {
  const problem = findContentProblem(text);
  if (problem === undefined) return;

  throw invalidContent(providerName, problem.reason, problem.excerpt);
};

export interface PreparedDocument {
  body: string;
  /** Set when a preamble was dropped, ready to be reported as a warning. */
  droppedPreamble: string | undefined;
}

/**
 * Normalizes then validates. Everything a provider returns goes through here
 * before it is allowed near the disk or the cache.
 */
export const prepareDocument = (providerName: string, text: string): PreparedDocument => {
  const { body, preamble } = normalizeDocument(providerName, text);
  assertDocumentContent(providerName, body);

  return { body, droppedPreamble: preamble };
};
