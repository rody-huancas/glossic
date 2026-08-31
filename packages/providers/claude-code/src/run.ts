import { type ChildProcess, spawn } from "node:child_process";

import { ProviderError } from "@glosik/schema";

export interface RunOptions {
  binary: string;
  args: readonly string[];
  /** Written to the child's stdin and closed. Prompts never go through argv. */
  input?: string;
  timeoutMs: number;
}

export interface RunOutcome {
  code: number;
  stdout: string;
  stderr: string;
}

const collect = (stream: NodeJS.ReadableStream | null, onChunk: (chunk: string) => void): void => {
  if (stream === null) return;
  stream.setEncoding("utf8");
  stream.on("data", onChunk);
};

const writeInput = (child: ChildProcess, input: string | undefined): void => {
  if (child.stdin === null) return;
  // Ignore EPIPE: the child may exit before reading a long prompt.
  child.stdin.on("error", () => {});
  child.stdin.end(input ?? "");
};

/**
 * Spawns a command, feeds it stdin and resolves with its output. Never
 * rejects with a raw error: spawn failures become ProviderError.
 */
export const run = (providerName: string, options: RunOptions): Promise<RunOutcome> =>
  new Promise<RunOutcome>((resolve, reject) => {
    let child: ChildProcess;

    try {
      child = spawn(options.binary, [...options.args], {
        // On Windows `claude` is a shim (.cmd/.ps1) that spawn cannot exec directly.
        shell: process.platform === "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (cause) {
      reject(
        new ProviderError({
          provider: providerName,
          code: "not-installed",
          message: `could not start "${options.binary}"`,
          cause,
        }),
      );
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new ProviderError({
          provider: providerName,
          code: "timeout",
          message: `${options.binary} timed out after ${options.timeoutMs}ms`,
          detail: stderr.trim() === "" ? undefined : stderr.trim(),
        }),
      );
    }, options.timeoutMs);
    timer.unref();

    collect(child.stdout, (chunk) => {
      stdout += chunk;
    });
    collect(child.stderr, (chunk) => {
      stderr += chunk;
    });

    child.on("error", (cause: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new ProviderError({
          provider: providerName,
          code: cause.code === "ENOENT" ? "not-installed" : "api",
          message:
            cause.code === "ENOENT"
              ? `"${options.binary}" was not found in PATH`
              : `"${options.binary}" failed to run`,
          cause,
        }),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });

    writeInput(child, options.input);
  });
