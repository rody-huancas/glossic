import { z } from "zod";

export const CompletionRequestSchema = z.object({
  system     : z.string().optional(),
  prompt     : z.string().min(1),
  model      : z.string().optional(),
  maxTokens  : z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  metadata   : z.record(z.string(), z.unknown()).default({}),
});
export type CompletionRequest = z.infer<typeof CompletionRequestSchema>;


export const CompletionUsageSchema = z.object({
  inputTokens    : z.number().int().nonnegative(),
  outputTokens   : z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
});
export type CompletionUsage = z.infer<typeof CompletionUsageSchema>;


export const CompletionResultSchema = z.object({
  text   : z.string(),
  model  : z.string(),
  usage  : CompletionUsageSchema.optional(),
  costUsd: z.number().nonnegative().optional(),
  raw    : z.unknown().optional(),
});
export type CompletionResult = z.infer<typeof CompletionResultSchema>;


export interface Provider {
  readonly name                       : string;
  available()                         : Promise<boolean>;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}
