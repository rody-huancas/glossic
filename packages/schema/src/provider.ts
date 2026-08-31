import { z } from "zod";
import { zFunction } from "./internal.js";

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
});
export type CompletionUsage = z.infer<typeof CompletionUsageSchema>;

export const CompletionResultSchema = z.object({
  text: z.string(),
  model: z.string(),
  usage: CompletionUsageSchema.optional(),
  /** Untouched provider payload, for debugging. */
  raw: z.unknown().optional(),
});
export type CompletionResult = z.infer<typeof CompletionResultSchema>;

/** A source of LLM completions. */
export const ProviderSchema = z.object({
  /** Unique provider id, e.g. "claude-code", "anthropic". */
  name: z.string().min(1),
  /** Whether the provider can be used right now (binary present, key set, ...). */
  available: zFunction<() => Promise<boolean>>(),
  complete: zFunction<(request: CompletionRequest) => Promise<CompletionResult>>(),
});
export type Provider = z.infer<typeof ProviderSchema>;
