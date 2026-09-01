import type { CompletionRequest, CompletionResult, Provider } from "@glossic/schema";

export interface FakeProvider extends Provider {
  /** Every request the provider was asked to complete, in call order. */
  readonly calls: CompletionRequest[];
}

export interface FakeProviderOptions {
  name?: string;
  available?: boolean;
  /** Returns the body for a request, or throws to simulate a failure. */
  respond?: (request: CompletionRequest, index: number) => string;
}

/**
 * Provider stand-in for tests and for anyone building an adapter: it records
 * every request and never touches the network.
 */
/**
 * Long enough and plain enough to survive `assertDocumentContent`: a fake that
 * returned a one-line stub would fail validation instead of the pipeline.
 */
const defaultDocument = (request: CompletionRequest, index: number): string =>
  [
    "## What it does",
    "",
    `Fake documentation number ${index} for ${String(request.metadata.unitId ?? "a unit")}.`,
    "",
    "## Responsibilities",
    "",
    "The unit owns its own behaviour and delegates everything else to its",
    "neighbours. Nothing here reaches outside the boundary it declares.",
    "",
    "## Public elements",
    "",
    "- Everything the unit exports, described in one line each.",
    "",
    "## Architectural decisions",
    "",
    "Dependencies point one way, errors are typed, and the ordering is total.",
  ].join("\n");

export const createFakeProvider = (options: FakeProviderOptions = {}): FakeProvider => {
  const calls: CompletionRequest[] = [];

  return {
    name: options.name ?? "fake",
    calls,
    available: async (): Promise<boolean> => options.available ?? true,
    complete: async (request: CompletionRequest): Promise<CompletionResult> => {
      const index = calls.length;
      calls.push(request);

      const text = options.respond?.(request, index) ?? defaultDocument(request, index);
      return { text, model: "fake-model", usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
};
