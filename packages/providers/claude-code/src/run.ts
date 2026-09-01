import { ProviderError } from "@glossic/schema";
import { type ChildProcess, spawn } from "node:child_process";

/** `timeoutMs` is enforced by killing the child, since the CLI has no budget of its own. */
export interface RunOptions {
  binary    : string;
  args      : readonly string[];
  input    ?: string;
  timeoutMs : number;
  cwd      ?: string;
}


export interface RunOutcome {
  code  : number;
  stdout: string;
  stderr: string;
}


/** Accumulates a child stream as utf8, tolerating a stream that was never opened. */
const collect = (stream: NodeJS.ReadableStream | null, onChunk: (chunk: string) => void): void => {
  if (stream === null) return;

  stream.setEncoding("utf8");
  stream.on("data", onChunk);
};

/** Sends the prompt on stdin and closes it, so the CLI knows the input ended. */
const writeInput = (child: ChildProcess, input: string | undefined): void => {
  if (child.stdin === null) return;

  child.stdin.on("error", () => {});
  child.stdin.end(input ?? "");
};

/**
 * Runs the CLI to completion. A missing binary, a timeout and a crash all come
 * back as a tagged ProviderError rather than a raw spawn failure.
 */
export const run = (providerName: string, options: RunOptions): Promise<RunOutcome> =>
  new Promise<RunOutcome>((resolve, reject) => {
    let child: ChildProcess;

    try {
      child = spawn(options.binary, [...options.args], {
        shell: process.platform === "win32",
        stdio: ["pipe", "pipe", "pipe"],
        ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      });
    } catch (cause) {
      reject(
        new ProviderError({
          provider: providerName,
          code    : "not-installed",
          message : `could not start "${options.binary}"`,
          cause,
        }),
      );
      return;
    }

    let stdout  = "";
    let stderr  = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;

      settled = true;
      child.kill("SIGKILL");

      reject(
        new ProviderError({
          provider: providerName,
          code    : "timeout",
          message : `${options.binary} timed out after ${options.timeoutMs}ms`,
          detail  : stderr.trim() === "" ? undefined                          : stderr.trim(),
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
          code    : cause.code === "ENOENT" ? "not-installed": "api",
          message : cause.code === "ENOENT"
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
