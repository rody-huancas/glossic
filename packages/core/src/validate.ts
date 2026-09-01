import { ProviderError } from "@glossic/schema";

/** Under this many characters the answer reads as a refusal, not as a document. */
export const MIN_DOCUMENT_LENGTH = 200;
/** Over this, what precedes the first heading is an answer rather than a preamble. */
export const MAX_PREAMBLE_LENGTH = 500;

interface ContentRule {
  reason : string;
  pattern: RegExp;
}

/** Shapes that mean the model addressed the reader instead of writing the document. */
const CONVERSATIONAL_RULES: readonly ContentRule[] = [
  {
    reason : "the model asked for permission instead of writing the document",
    pattern:
      /\b(permission to (write|save|create)|(write|read) permission|need (write )?access)\b/i,
  },
  {
    reason : "the model reported on saving a file instead of writing the document",
    pattern:
      /\bI( have|['’]ve)? ?(drafted|prepared|written|created|saved|generated) (the|this|a) /i,
  },
  {
    reason : "the model asked the reader a question",
    pattern: /\b(let me know|say the word|shall I|would you (like|prefer|want))\b/i,
  },
  {
    reason : "the model opened with a preamble instead of the document",
    pattern: /^\s*(here(['’]s| is)|below is|sure[,!]|certainly[,!]|I['’]ll)\b/i,
  },
  {
    reason : "the model addressed the reader in the first person",
    pattern: /\bI['’](ve|m|ll|d)\b/,
  },
  {
    reason : "the model addressed the reader in the first person",
    pattern: /\bI (need|cannot|can't|could not|couldn't|have|am|was|tried|noticed|assume)\b/,
  },
];

const FENCE       = /^\s{0,3}(```|~~~)/;
const TOP_HEADING = /^\s{0,3}#{1,2}\s+\S/;

interface SourceLine {
  text  : string;
  fenced: boolean;
}

/** Lines tagged with whether they sit inside a fenced code block. */
const scanLines = (text: string): SourceLine[] => {
  const lines: SourceLine[] = [];
  let fence: string | undefined;

  for (const line of text.split(/\r?\n/)) {
    const match = FENCE.exec(line);

    if (fence === undefined) {
      if (match !== null) {
        fence = match[1];
      }

      lines.push({ text: line, fenced: match !== null });
      continue;
    }

    lines.push({ text: line, fenced: true });
    if (match !== null && match[1] === fence) fence = undefined;
  }

  return lines;
};

export interface NormalizedDocument {
  body    : string;
  preamble: string | undefined;
}

const invalidContent = (providerName: string, reason: string, detail: string): ProviderError =>
  new ProviderError({
    provider: providerName,
    code    : "invalid-content",
    message : `the response is not a document: ${reason}`,
    detail,
  });

/** Shortens text for an error message, onto a single line. */
export const excerpt = (text: string, limit: number): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
};

/** Splits a response into the document and whatever the model said before it. */
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

  const body = lines
    .slice(first)
    .map((line) => line.text)
    .join("\n")
    .trim();

  return { body, preamble: dropped === "" ? undefined : dropped };
};

export interface ContentProblem {
  reason : string;
  excerpt: string;
}

const excerptAround = (text: string, index: number): string => {
  const start = Math.max(0, index - 30);
  return excerpt(text.slice(start, Math.min(text.length, index + 90)), 200);
};

/** The first conversational tell in the text, ignoring fenced code. */
export const findContentProblem = (text: string): ContentProblem | undefined => {
  const trimmed = text.trim();

  if (trimmed.length < MIN_DOCUMENT_LENGTH) {
    return {
      reason : `the response is ${trimmed.length} characters, below the ${MIN_DOCUMENT_LENGTH} minimum`,
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

/** Throws a ProviderError when the response reads as conversation, not documentation. */
export const assertDocumentContent = (providerName: string, text: string): void => {
  const problem = findContentProblem(text);

  if (problem === undefined) return;

  throw invalidContent(providerName, problem.reason, problem.excerpt);
};

export interface PreparedDocument {
  body           : string;
  droppedPreamble: string | undefined;
}

/** Normalises and validates in one pass: what generate writes is what survives this. */
export const prepareDocument = (providerName: string, text: string): PreparedDocument => {
  const { body, preamble } = normalizeDocument(providerName, text);
  assertDocumentContent(providerName, body);

  return { body, droppedPreamble: preamble };
};
