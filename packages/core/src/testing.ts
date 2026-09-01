import type { CompletionRequest, CompletionResult, Provider } from "@glossic/schema";

export interface FakeProvider extends Provider {
  readonly calls: CompletionRequest[];
}

export interface FakeProviderOptions {
  name     ?: string;
  available?: boolean;
  respond  ?: (request: CompletionRequest, index: number) => string;
}


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
    available: async ()                          : Promise<boolean> => options.available ?? true,
    complete : async (request: CompletionRequest): Promise<CompletionResult> => {
      const index = calls.length;
      calls.push(request);

      const text = options.respond?.(request, index) ?? defaultDocument(request, index);
      return { text, model: "fake-model", usage: { inputTokens: 10, outputTokens: 5 } };
    },
  };
};
