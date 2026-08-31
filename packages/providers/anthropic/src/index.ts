import type { CompletionRequest, CompletionResult, Provider } from "@glosik/schema";

export const anthropicProviderName = "anthropic" as const;

/** Default model used when a request does not pin one. */
export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5";

export interface AnthropicProviderOptions {
  /** Falls back to `process.env.ANTHROPIC_API_KEY`. */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  maxRetries?: number;
}

/**
 * Completion provider that talks to the Anthropic Messages API.
 *
 * Scaffold only: `available` always reports false and `complete` throws.
 */
export const createAnthropicProvider = (_options: AnthropicProviderOptions = {}): Provider => ({
  name: anthropicProviderName,

  available: async (): Promise<boolean> => false,

  complete: async (_request: CompletionRequest): Promise<CompletionResult> => {
    throw new Error("anthropic provider is not implemented");
  },
});

export const anthropicProvider: Provider = createAnthropicProvider();

export default anthropicProvider;
