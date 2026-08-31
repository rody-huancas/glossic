import { z } from "zod";

export const CompletionRequestSchema = z.object({
  /** System prompt / instructions. */
  system: z.string().optional(),
  /** User prompt. */
  prompt: z.string().min(1),
  model: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  /** Free-form correlation data (unit id, project id, ...). */
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type CompletionRequest = z.infer<typeof CompletionRequestSchema>;

export const CompletionUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
});
export type CompletionUsage = z.infer<typeof CompletionUsageSchema>;

export const CompletionResultSchema = z.object({
  text: z.string(),
  model: z.string(),
  usage: CompletionUsageSchema.optional(),
  /** Reported by providers that price the call themselves, e.g. claude-code. */
  costUsd: z.number().nonnegative().optional(),
  /** Untouched provider payload, for debugging. */
  raw: z.unknown().optional(),
});
export type CompletionResult = z.infer<typeof CompletionResultSchema>;

/**
 * A source of LLM completions. Every failure surfaces as a `ProviderError`.
 */
export interface Provider {
  /** Unique provider id, e.g. "claude-code", "anthropic". */
  readonly name: string;
  /** Whether the provider can be used right now (binary present, key set, ...). */
  available(): Promise<boolean>;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}
