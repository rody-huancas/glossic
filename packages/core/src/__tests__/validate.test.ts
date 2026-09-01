import { isProviderError } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import {
  assertDocumentContent,
  findContentProblem,
  MAX_PREAMBLE_LENGTH,
  MIN_DOCUMENT_LENGTH,
  normalizeDocument,
  prepareDocument,
} from "../validate.js";

/** The exact reply that shipped a broken document before this check existed. */
const THE_BUG = "I've drafted the documentation but need write permission to save it.";

const VALID_DOCUMENT = `## What it does

Resolves the workspace at a given root: its projects, the tool that declares
them and the package manager in use.

## Responsibilities

Detection order is fixed and part of the contract: \`pnpm-workspace.yaml\`, the
\`workspaces\` field of \`package.json\`, \`turbo.json\`, \`nx.json\`, \`lerna.json\`.
Reading files is delegated to \`fs-utils\`; ordering is delegated to \`order\`.

## Public elements

- \`resolveWorkspace(root)\` returns a \`Workspace\` with its projects sorted by id.

## Architectural decisions

Paths are normalised to posix so the manifest does not depend on the host
separator, and comparisons avoid \`localeCompare\` so they do not depend on ICU.
`;

const expectRejected = (text: string, fragment: string): void => {
  const problem = findContentProblem(text);
  expect(problem).toBeDefined();
  expect(problem?.reason).toContain(fragment);
};

describe("findContentProblem", () => {
  it("rejects the conversational reply that caused this check to exist", () => {
    expectRejected(THE_BUG, "characters, below the");
  });

  it("still rejects that reply through the full pipeline", () => {
    expect(() => prepareDocument("claude-code", THE_BUG)).toThrowError(/no markdown heading/);
  });

  it("rejects a long reply that asks for permission", () => {
    const padded = `${THE_BUG}\n\n${"The unit holds several modules. ".repeat(12)}`;
    expectRejected(padded, "permission");
  });

  it("rejects first-person address", () => {
    expectRejected(
      `## Overview\n\nI've reviewed the unit.\n\n${"It exposes a registry. ".repeat(15)}`,
      "first person",
    );
    expectRejected(
      `## Overview\n\nI cannot see the implementation.\n\n${"It exposes a registry. ".repeat(15)}`,
      "first person",
    );
  });

  it("rejects a question to the reader", () => {
    expectRejected(
      `## Overview\n\n${"It exposes a registry. ".repeat(15)}\n\nLet me know if you want more detail.`,
      "asked the reader a question",
    );
    expectRejected(
      `## Overview\n\n${"It exposes a registry. ".repeat(15)}\n\nWould you prefer a shorter version?`,
      "asked the reader a question",
    );
  });

  it("rejects a preamble", () => {
    expectRejected(
      `Here's the documentation for this unit.\n\n## Overview\n\n${"It exposes a registry. ".repeat(15)}`,
      "preamble",
    );
  });

  it("rejects a reply about having saved a file", () => {
    expectRejected(
      `## Overview\n\n${"It exposes a registry. ".repeat(15)}\n\nI have created the file for you.`,
      "saving a file",
    );
  });

  it("rejects a response that is too short", () => {
    expectRejected("## Overview\n\nA registry.", "below the");
    expect(MIN_DOCUMENT_LENGTH).toBeGreaterThan(THE_BUG.length);
  });

  it("accepts a real document", () => {
    expect(findContentProblem(VALID_DOCUMENT)).toBeUndefined();
  });

  it("does not trip on ordinary prose about a codebase", () => {
    const prose = `## What it does

Handles I/O for the importer. The caller decides whether the write happens;
this unit only prepares the payload. Errors are surfaced as typed failures so
a caller can tell a timeout from a bad request, and nothing here reads the
filesystem directly.

Note that \`Ingest\` requires write access to the target table, which the
migration grants.
`;
    expect(findContentProblem(prose)).toBeUndefined();
  });
});

describe("assertDocumentContent", () => {
  it("throws a non-retryable invalid-content ProviderError", () => {
    try {
      assertDocumentContent("claude-code", THE_BUG);
    } catch (error) {
      expect(isProviderError(error)).toBe(true);
      if (!isProviderError(error)) throw error;

      expect(error.code).toBe("invalid-content");
      expect(error.provider).toBe("claude-code");
      expect(error.message).toContain("not a document");
      expect(error.detail).toBeDefined();
      return;
    }
    throw new Error("expected assertDocumentContent to throw");
  });

  it("passes a real document through", () => {
    expect(() => assertDocumentContent("claude-code", VALID_DOCUMENT)).not.toThrow();
  });
});

describe("normalizeDocument", () => {
  const BODY = [
    "## What it does",
    "",
    "Resolves the workspace at a given root and returns its projects.",
    "",
    "### Details",
    "",
    "Ordering is total and paths are posix, so the manifest is reproducible.",
  ].join("\n");

  it("drops a short preamble and reports it", () => {
    const preamble = "The working directory is empty, so I worked from the sources given.";
    const result = normalizeDocument("claude-code", `${preamble}\n\n${BODY}`);

    expect(result.body).toBe(BODY);
    expect(result.preamble).toBe(preamble);
  });

  it("leaves a document that already starts at a heading untouched", () => {
    const result = normalizeDocument("claude-code", BODY);

    expect(result.body).toBe(BODY);
    expect(result.preamble).toBeUndefined();
  });

  it("rejects a preamble longer than the limit", () => {
    const preamble = "This is context about the environment. ".repeat(20);
    expect(preamble.length).toBeGreaterThan(MAX_PREAMBLE_LENGTH);

    expect(() => normalizeDocument("claude-code", `${preamble}\n\n${BODY}`)).toThrowError(
      /over the 500 limit/,
    );
  });

  it("rejects a response with no heading at all", () => {
    expect(() =>
      normalizeDocument("claude-code", "Just some prose, at length, with no heading anywhere."),
    ).toThrowError(/no markdown heading/);
  });

  it("ignores a comment inside a fenced block when looking for the heading", () => {
    const withFence = ["```bash", "# not a heading", "```", "", BODY].join("\n");
    const result = normalizeDocument("claude-code", withFence);

    expect(result.body).toBe(BODY);
    expect(result.preamble).toBe(["```bash", "# not a heading", "```"].join("\n"));
  });
});

describe("heading levels", () => {
  // Nothing is injected above the body any more, so the model's own h1 is
  // the document's only title and there is nothing left to demote.
  it("leaves a leading h1 and everything under it alone", () => {
    const raw = [
      "# Users Module",
      "",
      "Handles the /users surface.",
      "",
      "## Overview",
      "",
      "### Routes",
      "",
      "Text.",
    ].join("\n");

    expect(normalizeDocument("claude-code", raw).body).toBe(raw);
  });

  it("leaves a document that already starts at h2 alone", () => {
    const raw = ["## Overview", "", "### Details", "", "Text."].join("\n");
    expect(normalizeDocument("claude-code", raw).body).toBe(raw);
  });

  it("leaves a fenced block untouched", () => {
    const raw = ["# Top", "", "```bash", "# a shell comment", "```"].join("\n");
    expect(normalizeDocument("claude-code", raw).body).toBe(raw);
  });

  it("does not accept a hash inside a fence as the heading", () => {
    const raw = ["```bash", "# a shell comment", "```"].join("\n");

    expect(() => normalizeDocument("claude-code", raw)).toThrowError(/no markdown heading/);
  });
});

describe("prepareDocument", () => {
  const DOCUMENT = [
    "# Users Module",
    "",
    "Handles the /users surface for the API. The controller validates input,",
    "the service owns the persistence and the dto layer describes the payloads.",
    "",
    "## Public elements",
    "",
    "- `UsersController` exposes the HTTP routes.",
    "- `UsersService` owns the data access.",
  ].join("\n");

  it("trims the preamble and validates in one pass", () => {
    const raw = `The repo is not checked out here, so this comes from the sources.\n\n${DOCUMENT}`;
    const prepared = prepareDocument("claude-code", raw);

    expect(prepared.droppedPreamble).toContain("not checked out");
    expect(prepared.body.startsWith("# Users Module")).toBe(true);
    expect(prepared.body).not.toContain("not checked out");
  });

  it("reports nothing dropped for a clean document", () => {
    expect(prepareDocument("claude-code", DOCUMENT).droppedPreamble).toBeUndefined();
  });

  it("still rejects a chat reply that happens to contain a heading", () => {
    const raw = `## Note\n\nI've drafted the documentation but need write permission to save it.`;
    expect(() => prepareDocument("claude-code", raw)).toThrowError(/not a document/);
  });
});
