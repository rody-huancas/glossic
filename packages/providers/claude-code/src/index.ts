import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

/**
 * The CLI boots the whole agent before it answers, which is far slower than a
 * plain API call. 120s was not enough on real units.
 */
const DEFAULT_TIMEOUT_MS = 300_000;
const AVAILABILITY_TIMEOUT_MS = 15_000;

/**
 * `claude -p` runs the full coding agent: it can read and write files, it
 * loads the CLAUDE.md and .claude/settings.json of whatever directory it
 * starts in, and it talks to the user. None of that belongs in a completion —
 * it produced documents that read "I've drafted the documentation but need
 * write permission to save it".
 *
 * These flags strip the agent back to a completion. Verified against Claude
 * Code 2.1.252: with them, a prompt asking the agent to read a file in its own
 * working directory answers that it cannot.
 */
export const ISOLATION_ARGS: readonly string[] = [
  // No tools at all. Everything the model needs is already in the prompt.
  "--allowed-tools",
  "",
  // Do not load user, project or local settings.
  "--setting-sources",
  "",
  // Do not load MCP servers from anywhere.
  "--strict-mcp-config",
];

export interface ClaudeCodeProviderOptions {
  /** Path to the `claude` executable. */
  binary?: string;
  /** Passed through as `--model`. Defaults to whatever the CLI is configured with. */
  model?: string;
  /** Milliseconds before a completion is killed. */
  timeoutMs?: number;
  /**
   * Directory the CLI runs in. Defaults to an empty temporary directory so the
   * agent never sees the scanned project's CLAUDE.md or settings.
   */
  cwd?: string;
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

export const buildArgs = (
  options: ClaudeCodeProviderOptions,
  request: CompletionRequest,
): string[] => {
  const args = ["-p", "--output-format", "json", ...ISOLATION_ARGS];

  const model = request.model ?? options.model;
  if (model !== undefined) args.push("--model", model);

  // --system-prompt replaces the agent's own prompt; --append-system-prompt
  // would leave the conversational persona in place underneath ours.
  if (request.system !== undefined) args.push("--system-prompt", request.system);

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
  let sandbox: Promise<string> | undefined;

  /** An empty directory: nothing for the CLI to pick up configuration from. */
  const sandboxDir = async (): Promise<string> => {
    if (options.cwd !== undefined) return options.cwd;
    sandbox ??= fs.mkdtemp(path.join(os.tmpdir(), "glossic-claude-"));
    return sandbox;
  };

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
        cwd: await sandboxDir(),
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
