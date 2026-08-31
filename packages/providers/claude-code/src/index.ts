import type { CompletionRequest, CompletionResult, Provider } from "@glosik/schema";

export const claudeCodeProviderName = "claude-code" as const;

/** Default model used when a request does not pin one. */
export const CLAUDE_CODE_DEFAULT_MODEL = "claude-opus-5";

export interface ClaudeCodeProviderOptions {
  /** Path to the `claude` executable. */
  binary?: string;
  model?: string;
  /** Milliseconds before a completion is aborted. */
  timeoutMs?: number;
}

/**
 * Completion provider that shells out to the Claude Code CLI.
 *
 * Scaffold only: `available` always reports false and `complete` throws.
 */
export const createClaudeCodeProvider = (_options: ClaudeCodeProviderOptions = {}): Provider => ({
  name: claudeCodeProviderName,

  available: async (): Promise<boolean> => false,

  complete: async (_request: CompletionRequest): Promise<CompletionResult> => {
    throw new Error("claude-code provider is not implemented");
  },
});

export const claudeCodeProvider: Provider = createClaudeCodeProvider();

export default claudeCodeProvider;
