import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CompletionRequest, CompletionResult, Provider, ProviderErrorCode } from "@glossic/schema";
import { ProviderError } from "@glossic/schema";
import { run } from "./run.js";
import { parseClaudeOutput } from "./output.js";

export const claudeCodeProviderName    = "claude-code";
export const CLAUDE_CODE_DEFAULT_MODEL = "claude-code";

const DEFAULT_TIMEOUT_MS      = 300_000;
const AVAILABILITY_TIMEOUT_MS = 15_000;


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

const classifyExit = (stderr: string): ProviderErrorCode => {
  const text = stderr.toLowerCase();

  if (/rate.?limit|overloaded|too many requests|529|503/.test(text)) {
    return "rate-limit";
  }

  if (/login|not authenticated|unauthorized|api key/.test(text)) {
    return "unauthenticated";
  }

  return "exit-code";
};

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
        throw new ProviderError({
          provider: claudeCodeProviderName,
          code    : classifyExit(outcome.stderr),
          message : `claude exited with code ${outcome.code}`,
          detail  : (outcome.stderr.trim() || outcome.stdout.trim()).slice(0, 400),
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
