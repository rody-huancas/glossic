import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CompletionRequest, CompletionResult, Provider, ProviderErrorCode } from "@glossic/schema";
import { looksLikeQuota, ProviderError } from "@glossic/schema";
import { run } from "./run.js";
import { parseClaudeOutput } from "./output.js";
import { describeFailure } from "./failure.js";

export const claudeCodeProviderName    = "claude-code";
/** The CLI picks its own model, so "claude-code" stands in for whatever it used. */
export const CLAUDE_CODE_DEFAULT_MODEL = "claude-code";

const DEFAULT_TIMEOUT_MS      = 300_000;
/** Probing must not hang the menu, so the availability check gets its own short budget. */
const AVAILABILITY_TIMEOUT_MS = 15_000;


/**
 * Strips the agent down to a single completion: no tools, no user settings, no
 * MCP servers. What glossic wants is prose, not an agent acting on the repo.
 */
export const ISOLATION_ARGS: readonly string[] = [
  "--allowed-tools",
  "",
  "--setting-sources",
  "",
  "--strict-mcp-config",
];

export interface ClaudeCodeProviderOptions {
  binary   ?: string;
  model    ?: string;
  timeoutMs?: number;
  cwd      ?: string;
  extraArgs?: readonly string[];
}

/**
 * Reads a non-zero exit for the reason, so a retryable failure is retried and a
 * spent quota is not. Quota is tested first: "usage limit reached" is not the
 * transient limit that "rate limit" names, and lifts only when the plan resets.
 */
const classifyExit = (output: string): ProviderErrorCode => {
  const text = output.toLowerCase();

  if (looksLikeQuota(text)) {
    return "quota";
  }

  if (/rate.?limit|overloaded|too many requests|529|503/.test(text)) {
    return "rate-limit";
  }

  if (/login|not authenticated|unauthorized|api key/.test(text)) {
    return "unauthenticated";
  }

  return "exit-code";
};

/** The full argument list for one completion, isolation flags included. */
export const buildArgs = (options: ClaudeCodeProviderOptions, request: CompletionRequest): string[] => {
  const args = ["-p", "--output-format", "json", ...ISOLATION_ARGS];

  const model = request.model ?? options.model;

  if (model !== undefined) {
    args.push("--model", model);
  }

  if (request.system !== undefined) {
    args.push("--system-prompt", request.system);
  }

  if (options.extraArgs !== undefined) {
    args.push(...options.extraArgs);
  }

  return args;
};


/**
 * Provider backed by the local Claude Code CLI. It costs nothing extra when
 * the user already has a session, which is why it is probed first.
 */
export const createClaudeCodeProvider = (options: ClaudeCodeProviderOptions = {}): Provider => {
  const binary    = options.binary ?? "claude";
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let availability: Promise<boolean> | undefined;
  let sandbox     : Promise<string> | undefined;

  const sandboxDir = async (): Promise<string> => {
    if (options.cwd !== undefined) {
      return options.cwd;
    }

    sandbox ??= fs.mkdtemp(path.join(os.tmpdir(), "glossic-claude-"));

    return sandbox;
  };

  const probe = async (): Promise<boolean> => {
    try {
      const outcome = await run(claudeCodeProviderName, {
        binary,
        args     : ["--version"],
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
        args : buildArgs(options, request),
        input: request.prompt,
        timeoutMs,
        cwd: await sandboxDir(),
      });

      if (outcome.code !== 0) {
        const raw = outcome.stderr.trim() === "" ? outcome.stdout : outcome.stderr;

        throw new ProviderError({
          provider: claudeCodeProviderName,
          code    : classifyExit(`${outcome.stderr} ${outcome.stdout}`),
          ...describeFailure(raw, `claude exited with code ${outcome.code}`),
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

/** The default-configured instance, for callers with nothing to override. */
export const claudeCodeProvider: Provider = createClaudeCodeProvider();

export { parseClaudeOutput } from "./output.js";
export { DEBUG_ENV, debugEnabled, describeFailure, extractMessage, oneLine } from "./failure.js";
export type { FailureText } from "./failure.js";
export default claudeCodeProvider;
