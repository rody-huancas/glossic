import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createFakeProvider } from "@glossic/core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runGenerate } from "../commands/generate.js";
import { runInteractive } from "../interactive/index.js";
import type { PromptPort } from "../ui/prompts.js";

const tempDirs: string[] = [];

const SOURCES: Record<string, string> = {
  "package.json": '{ "name": "out-dir-fixture", "type": "module" }',
  "src/index.ts": "export const start = 1;",
  "src/server.ts": "export const server = 2;",
  "src/app.ts": "export const app = 3;",
};

let root: string;
let home: string;

const write = async (file: string, content: string): Promise<void> => {
  const target = path.join(root, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
};

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-out-"));
  home = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-home-"));
  tempDirs.push(root, home);

  for (const [file, content] of Object.entries(SOURCES)) await write(file, content);
});

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

/** Answers every prompt from a script instead of a terminal. */
const scripted = (answers: unknown[]): PromptPort => {
  let cursor = 0;

  const next = async (): Promise<never> => {
    if (cursor >= answers.length) throw new Error("the script ran out of answers");
    return answers[cursor++] as never;
  };

  return {
    intro: () => {},
    outro: () => {},
    note: () => {},
    cancel: () => {},
    select: next,
    text: next,
    confirm: next,
    isCancel: () => false,
  };
};

const exists = (target: string): Promise<boolean> =>
  fs.access(target).then(
    () => true,
    () => false,
  );

/**
 * Drives the real chain: the menu asks, `runGenerate` resolves the path and
 * core writes the files. Only the provider is faked, so a path that goes
 * missing anywhere between the prompt and the disk fails here.
 */
const generateInteractively = async (answer: string): Promise<number> => {
  const fake = createFakeProvider();

  return runInteractive({
    prompts: scripted(["generate", "es", answer, true, "exit"]),
    cwd: root,
    preferences: { env: { APPDATA: home }, platform: "win32", homedir: home },
    runGenerate: (target, options) =>
      runGenerate(target, options, { cwd: root, createProviders: () => [fake] }),
  });
};

describe("the output directory chosen in the menu", () => {
  it("is where the documentation lands, not the default", async () => {
    const chosen = path.join(home, "riqsi-front-docs");

    expect(await generateInteractively(chosen)).toBe(0);

    expect(await exists(path.join(chosen, "index.md"))).toBe(true);
    expect(await exists(path.join(root, "docs"))).toBe(false);
  });

  it("outranks an output.dir declared by the project", async () => {
    await write("glossic.config.ts", 'export default { output: { dir: "docs-handbook" } };');
    const chosen = path.join(home, "riqsi-front-docs");

    expect(await generateInteractively(chosen)).toBe(0);

    expect(await exists(path.join(chosen, "index.md"))).toBe(true);
    expect(await exists(path.join(root, "docs-handbook"))).toBe(false);
  });

  it("falls back to that output.dir only when the answer is empty", async () => {
    await write("glossic.config.ts", 'export default { output: { dir: "docs-handbook" } };');

    // An empty answer means "whatever is configured", not "./docs".
    expect(await generateInteractively("")).toBe(0);

    expect(await exists(path.join(root, "docs-handbook", "index.md"))).toBe(true);
  });
});
