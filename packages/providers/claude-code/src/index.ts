import type {
  CompletionRequest,
  CompletionResult,
  Provider,
  ProviderErrorCode,
} from "@glossic/schema";
import { ProviderError } from "@glossic/schema";

import { parseClaudeOutput } from "./output.js";
import { run } from "./run.js";

export const claudeCodeProviderName = "claude-code";

/** What the CLI reports when the payload does not name a model. */
export const CLAUDE_CODE_DEFAULT_MODEL = "claude-code";

const DEFAULT_TIMEOUT_MS = 120_000;
const AVAILABILITY_TIMEOUT_MS = 15_000;

export interface ClaudeCodeProviderOptions {
  /** Path to the `claude` executable. */
  binary?: string;
  /** Passed through as `--model`. Defaults to whatever the CLI is configured with. */
  model?: string;
  /** Milliseconds before a completion is killed. */
  timeoutMs?: number;
  /** Extra flags appended to every completion call. */
  extraArgs?: readonly string[];
}

/** The CLI reports everything through stderr, so the text is all we have. */
const classifyExit = (stderr: string): ProviderErrorCode => {
  const text = stderr.toLowerCase();
  if (/rate.?limit|overloaded|too many requests|529|503/.test(text)) return "rate-limit";
  if (/login|not authenticated|unauthorized|api key/.test(text)) return "unauthenticated";
  return "exit-code";
};

const buildArgs = (options: ClaudeCodeProviderOptions, request: CompletionRequest): string[] => {
  const args = ["-p", "--output-format", "json"];

  const model = request.model ?? options.model;
  if (model !== undefined) args.push("--model", model);
  if (request.system !== undefined) args.push("--append-system-prompt", request.system);
  if (options.extraArgs !== undefined) args.push(...options.extraArgs);

  return args;
};

/**
 * Completion provider that shells out to the Claude Code CLI in headless mode.
 * The prompt goes through stdin: unit prompts routinely exceed the argv limit.
 */
export const createClaudeCodeProvider = (options: ClaudeCodeProviderOptions = {}): Provider => {
  const binary = options.binary ?? "claude";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // One probe per process: `claude --version` costs ~200ms and cannot change
  // meaningfully while glossic runs.
  let availability: Promise<boolean> | undefined;

  const probe = async (): Promise<boolean> => {
    try {
      const outcome = await run(claudeCodeProviderName, {
        binary,
        args: ["--version"],
        timeoutMs: AVAILABILITY_TIMEOUT_MS,
      });
      return outcome.code === 0;
    } catch {
      return false;
    }
  };

  return {
    name: claudeCodeProviderName,

    available: async (): Promise<boolean> => {
      availability ??= probe();
      return availability;
    },

    complete: async (request: CompletionRequest): Promise<CompletionResult> => {
      const outcome = await run(claudeCodeProviderName, {
        binary,
        args: buildArgs(options, request),
        input: request.prompt,
        timeoutMs,
      });

      if (outcome.code !== 0) {
        throw new ProviderError({
          provider: claudeCodeProviderName,
          code: classifyExit(outcome.stderr),
          message: `claude exited with code ${outcome.code}`,
          detail: (outcome.stderr.trim() || outcome.stdout.trim()).slice(0, 400),
        });
      }

      return parseClaudeOutput(
        claudeCodeProviderName,
        outcome.stdout,
        request.model ?? options.model ?? CLAUDE_CODE_DEFAULT_MODEL,
      );
    },
  };
};

export const claudeCodeProvider: Provider = createClaudeCodeProvider();

export { parseClaudeOutput } from "./output.js";
export default claudeCodeProvider;
