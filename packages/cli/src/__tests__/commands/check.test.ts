import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { createFakeProvider } from "@glossic/core";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCheck } from "../../commands/check.js";
import { runGenerate } from "../../commands/generate/index.js";

const tempDirs: string[] = [];

const SOURCES: Record<string, string> = {
  "package.json" : '{ "name": "check-flags-fixture", "type": "module" }',
  "src/index.ts" : "export const start = 1;",
  "src/server.ts": "export const server = 2;",
  "src/app.ts"   : "export const app = 3;",
};

let root  : string;
let stdout: string[];
let stderr: string[];

beforeEach(async () => {
  root   = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-check-flags-"));
  stdout = [];
  stderr = [];
  tempDirs.push(root);

  for (const [file, content] of Object.entries(SOURCES)) {
    const target = path.join(root, file);

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }

  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });

  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();

  // Documentation behind its code sets it, and a leaked non-zero code fails the whole test run.
  process.exitCode = 0;
});

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

/** Documents the fixture into a directory the config never mentions, so only the flag can find it. */
const generateInto = async (dir: string): Promise<void> => {
  const fake = createFakeProvider();

  await runGenerate(root, { out: dir }, { cwd: root, createProviders: () => [fake] });
};

const warned = (): string => stderr.join("");

describe("where check reads the generated pages from", () => {
  it("is the directory --docs names", async () => {
    const elsewhere = path.join(root, "handbook");
    await generateInto(elsewhere);

    const result = await runCheck(root, { docs: elsewhere });

    expect(result.ok).toBe(true);
    expect(result.upToDate).toHaveLength(1);
    expect(warned()).not.toContain("--out");
  });

  it("still answers to --out, saying once that the flag moved", async () => {
    const elsewhere = path.join(root, "handbook");
    await generateInto(elsewhere);

    const result = await runCheck(root, { out: elsewhere });

    expect(result.ok).toBe(true);
    expect(result.upToDate).toHaveLength(1);

    const notice = warned().split("\n").filter((line) => line.includes("--out"));
    expect(notice).toHaveLength(1);
    expect(notice[0]).toContain("--docs");
  });

  it("prefers --docs when both are given", async () => {
    const kept = path.join(root, "handbook");
    await generateInto(kept);

    const result = await runCheck(root, { docs: kept, out: path.join(root, "nowhere") });

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("falls back to the directory the last generate recorded, not to the default", async () => {
    // The lived bug: generate into docs-walearning, then check looks in docs
    // and calls every page missing.
    await generateInto(path.join(root, "docs-walearning"));

    const result = await runCheck(root, {});

    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("falls back to the configured output directory when nothing was recorded", async () => {
    await generateInto(path.join(root, "docs"));
    await fs.rm(path.join(root, ".glossic"), { force: true, recursive: true });

    const result = await runCheck(root, {});

    expect(result.ok).toBe(true);
    expect(warned()).not.toContain("--out");
  });
});
