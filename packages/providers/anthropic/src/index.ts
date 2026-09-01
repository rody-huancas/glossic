import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, CompletionResult, Provider } from "@glossic/schema";
import { isProviderError, ProviderError } from "@glossic/schema";

export const anthropicProviderName   = "anthropic";
export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5";
const  DEFAULT_MAX_TOKENS            = 16_000;

const SAMPLING_REJECTED_BY = [
  "claude-fable-",
  "claude-mythos-",
  "claude-opus-5",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-sonnet-5",
];

export const acceptsTemperature = (model: string): boolean =>
  !SAMPLING_REJECTED_BY.some((prefix) => model.startsWith(prefix));

export interface AnthropicProviderOptions {
  apiKey      ?: string;
  baseUrl     ?: string;
  model       ?: string;
  maxTokens   ?: number;
  createClient?: (apiKey: string) => Anthropic;
}

const readApiKey = (options: AnthropicProviderOptions): string | undefined => {
  const key = options.apiKey ?? process.env.ANTHROPIC_API_KEY;

  return key === undefined || key.trim() === "" ? undefined : key;
};

const toProviderError = (cause: unknown): ProviderError => {
  if (isProviderError(cause)) return cause;

  if (cause instanceof Anthropic.AuthenticationError) {
    return new ProviderError({
      provider: anthropicProviderName,
      code    : "unauthenticated",
      message : "ANTHROPIC_API_KEY was rejected",
      detail  : cause.message,
      cause,
    });
  }

  if (cause instanceof Anthropic.RateLimitError) {
    return new ProviderError({
      provider: anthropicProviderName,
      code    : "rate-limit",
      message : "the Anthropic API rate limit was hit",
      detail  : cause.message,
      cause,
    });
  }

  if (cause instanceof Anthropic.APIConnectionError) {
    return new ProviderError({
      provider: anthropicProviderName,
      code    : "timeout",
      message : "could not reach the Anthropic API",
      detail  : cause.message,
      cause,
    });
  }

  if (cause instanceof Anthropic.APIError) {
    const status = cause.status ?? 0;
    return new ProviderError({
      provider: anthropicProviderName,
      code    : status >= 500 ? "server"                                  : "api",
      message : `the Anthropic API returned ${cause.status ?? "an error"}`,
      detail  : cause.message,
      cause,
    });
  }

  return new ProviderError({
    provider: anthropicProviderName,
    code    : "api",
    message : "the Anthropic API call failed",
    detail  : cause instanceof Error ? cause.message: undefined,
    cause,
  });
};

const extractText = (message: Anthropic.Message): string => {
  return   message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}


export const createAnthropicProvider = (options: AnthropicProviderOptions = {}): Provider => {
  const model = options.model ?? ANTHROPIC_DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const createClient = options.createClient ?? ((apiKey: string) => new Anthropic({
    apiKey,
    ...(options.baseUrl === undefined ? {} : { baseURL: options.baseUrl }),
  }));

  let client: Anthropic | undefined;

  const requireClient = (): Anthropic => {
    const apiKey = readApiKey(options);

    if (apiKey === undefined) {
      throw new ProviderError({
        provider: anthropicProviderName,
        code    : "unauthenticated",
        message : "ANTHROPIC_API_KEY is not set",
        detail  : "Create a key at https://console.anthropic.com/settings/keys and export it.",
      });
    }

    client ??= createClient(apiKey);
    return client;
  };

  return {
    name: anthropicProviderName,

    available: async (): Promise<boolean> => readApiKey(options) !== undefined,

    complete: async (request: CompletionRequest): Promise<CompletionResult> => {
      const requestModel = request.model ?? model;
      const temperature  = request.temperature ?? 0;

      let message: Anthropic.Message;
      try {
        message = await requireClient().messages.create({
          model     : requestModel,
          max_tokens: request.maxTokens ?? maxTokens,
          ...(request.system === undefined ? {} : { system: request.system }),
          ...(acceptsTemperature(requestModel) ? { temperature } : {}),
          messages: [{ role: "user", content: request.prompt }],
        });
      } catch (cause) {
        throw toProviderError(cause);
      }

      if (message.stop_reason === "refusal") {
        throw new ProviderError({
          provider: anthropicProviderName,
          code    : "refused",
          message : "the model declined to answer",
          detail  : `stop_reason=refusal on ${message.model}`,
        });
      }

      return {
        text : extractText(message),
        model: message.model,
        usage: {
          inputTokens : message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          ...(message.usage.cache_read_input_tokens === null ||
          message.usage.cache_read_input_tokens === undefined
            ? {}
            : { cacheReadTokens: message.usage.cache_read_input_tokens }),
        },
        raw: message,
      };
    },
  };
};

export const anthropicProvider: Provider = createAnthropicProvider();

export default anthropicProvider;
