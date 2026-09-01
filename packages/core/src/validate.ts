import { ProviderError } from "@glossic/schema";

/**
 * Shorter than this and the model did not write a document: it wrote a note
 * about the document. The shortest real unit doc glossic produces runs to a
 * few hundred characters.
 */
export const MIN_DOCUMENT_LENGTH = 200;

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

export interface ContentProblem {
  reason: string;
  /** The offending snippet, so the failure line is actionable. */
  excerpt: string;
}

const excerptAround = (text: string, index: number): string => {
  const start = Math.max(0, index - 30);
  return text
    .slice(start, Math.min(text.length, index + 90))
    .replace(/\s+/g, " ")
    .trim();
};

/** Returns what is wrong with a generated document, or undefined when it is fine. */
export const findContentProblem = (text: string): ContentProblem | undefined => {
  const trimmed = text.trim();

  if (trimmed.length < MIN_DOCUMENT_LENGTH) {
    return {
      reason: `the response is ${trimmed.length} characters, below the ${MIN_DOCUMENT_LENGTH} minimum`,
      excerpt: trimmed.slice(0, 120),
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

  throw new ProviderError({
    provider: providerName,
    code: "invalid-content",
    message: `the response is not a document: ${problem.reason}`,
    detail: problem.excerpt,
  });
};
