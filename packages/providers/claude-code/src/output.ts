import { ProviderError } from "@glossic/schema";
import type { CompletionResult } from "@glossic/schema";


interface ClaudeResultPayload {
  type          ?: string;
  subtype       ?: string;
  is_error      ?: boolean;
  result        ?: unknown;
  error         ?: unknown;
  model         ?: unknown;
  total_cost_usd?: unknown;
  usage         ?: {
    input_tokens           ?: unknown;
    output_tokens          ?: unknown;
    cache_read_input_tokens?: unknown;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const asInteger = (value: unknown): number | undefined => {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

const pickResult = (parsed: unknown): ClaudeResultPayload | undefined => {
  if (isRecord(parsed)) {
    return parsed as ClaudeResultPayload;
  }

  if (!Array.isArray(parsed)) {
    return undefined;
  }

  for (let index = parsed.length - 1; index >= 0; index -= 1) {
    const entry = parsed[index];

    if (isRecord(entry) && (entry.type === "result" || "result" in entry)) {
      return entry as ClaudeResultPayload;
    }
  }
  return undefined;
};

const buildUsage = (payload: ClaudeResultPayload): CompletionResult["usage"] => {
  const inputTokens  = asInteger(payload.usage?.input_tokens);
  const outputTokens = asInteger(payload.usage?.output_tokens);

  if (inputTokens === undefined || outputTokens === undefined) {
    return undefined;
  }

  const cacheReadTokens = asInteger(payload.usage?.cache_read_input_tokens);
  return cacheReadTokens === undefined
    ? { inputTokens, outputTokens }
    : { inputTokens, outputTokens, cacheReadTokens };
};

export const parseClaudeOutput = (providerName: string, stdout: string, fallbackModel: string): CompletionResult => {
  const trimmed = stdout.trim();

  if (trimmed === "") {
    throw new ProviderError({
      provider: providerName,
      code    : "invalid-output",
      message : "claude returned no output",
    });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch (cause) {
    throw new ProviderError({
      provider: providerName,
      code    : "invalid-output",
      message : "claude did not return valid JSON",
      detail  : trimmed.slice(0, 400),
      cause,
    });
  }

  const payload = pickResult(parsed);

  if (payload === undefined) {
    throw new ProviderError({
      provider: providerName,
      code    : "invalid-output",
      message : "claude returned JSON without a result",
      detail  : trimmed.slice(0, 400),
    });
  }

  if (payload.is_error === true || payload.subtype === "error_during_execution") {
    const detail = typeof payload.error === "string" ? payload.error : payload.subtype;

    throw new ProviderError({
      provider: providerName,
      code    : "api",
      message : "claude reported an error",
      ...(detail === undefined ? {} : { detail }),
    });
  }

  if (typeof payload.result !== "string") {
    throw new ProviderError({
      provider: providerName,
      code    : "invalid-output",
      message : "claude returned a result that is not text",
      detail  : trimmed.slice(0, 400),
    });
  }

  const usage   = buildUsage(payload);
  const costUsd = typeof payload.total_cost_usd === "number" ? payload.total_cost_usd : undefined;

  return {
    text : payload.result,
    model: typeof payload.model === "string" ? payload.model: fallbackModel,
    ...(usage === undefined ? {} : { usage }),
    ...(costUsd === undefined ? {} : { costUsd }),
    raw: parsed,
  };
};
