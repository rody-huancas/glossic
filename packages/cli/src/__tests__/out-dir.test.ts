import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createFakeProvider, toPosix } from "@glossic/core";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runEject } from "../commands/eject/index.js";
import { runGenerate } from "../commands/generate/index.js";
import { runScan } from "../commands/scan.js";
import { runInteractive } from "../interactive/index.js";
import type { PromptPort, SelectOption } from "../ui/prompts.js";

const tempDirs: string[] = [];

const SOURCES: Record<string, string> = {
  "package.json" : '{ "name": "out-dir-fixture", "type": "module" }',
  "src/index.ts" : "export const start = 1;",
  "src/server.ts": "export const server = 2;",
  "src/app.ts"   : "export const app = 3;",
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
const scripted = (answers: unknown[], offered: string[] = []): PromptPort => {
  let cursor = 0;

  const next = async (options: { message: string; placeholder?: string | undefined }): Promise<never> => {
    if (options.placeholder !== undefined) offered.push(options.placeholder);
    if (cursor >= answers.length) throw new Error("the script ran out of answers");
    return answers[cursor++] as never;
  };

  return {
    intro   : () => {},
    outro   : () => {},
    note    : () => {},
    cancel  : () => {},
    select  : next,
    text    : next,
    password: next,
    confirm : next,
    clear   : () => false,
    pause   : async () => {},
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
    prompts    : scripted(["generate", "es", answer, true, "exit"]),
    cwd        : root,
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

  it("proposes the directory the last run recorded, not the default", async () => {
    const fake    = createFakeProvider();
    const offered: string[] = [];

    const menu = async (answers: unknown[]): Promise<number> =>
      runInteractive({
        prompts    : scripted(answers, offered),
        cwd        : root,
        preferences: { env: { APPDATA: home }, platform: "win32", homedir: home },
        runGenerate: (target, options) =>
          runGenerate(target, options, { cwd: root, createProviders: () => [fake] }),
      });

    // Generate somewhere the config never mentions, so the manifest is the only
    // thing that knows where the documentation went.
    expect(await menu(["generate", "es", "docs-walearning", true, "exit"])).toBe(0);
    expect(await exists(path.join(root, "docs-walearning", "index.md"))).toBe(true);

    offered.length = 0;

    // Second visit: the placeholder is the recorded directory, and accepting it
    // writes there rather than starting a second folder called docs.
    expect(await menu(["generate", "es", "", true, "exit"])).toBe(0);

    expect(offered).toContain("docs-walearning");
    expect(offered).not.toContain("docs");
    expect(await exists(path.join(root, "docs"))).toBe(false);
  });
});

/**
 * `runEject` resolves its target against the real process cwd, so a test drives
 * it the way the menu drives `runGenerate`: injected, with the temp root.
 */
describe("eject follows the documentation wherever generate put it", () => {
  const generateInto = async (out: string): Promise<void> => {
    const fake = createFakeProvider();

    await runGenerate(".", { out, quiet: true }, { cwd: root, createProviders: () => [fake] });
  };

  it("finds a non-default directory with no flags at all", async () => {
    const chosen = path.join(home, "docs-riqsi");
    await generateInto(chosen);

    expect(await exists(path.join(chosen, "index.md"))).toBe(true);

    const result = await runEject(root, { uiLang: "en" });

    expect(result.docsDir).toBe(toPosix(chosen));
    expect(result.pages.length).toBeGreaterThan(1);
  });

  it("still reads the default when generate used it", async () => {
    await generateInto(path.join(root, "docs"));

    const result = await runEject(root, { uiLang: "en" });

    expect(result.docsDir).toBe(toPosix(path.join(root, "docs")));
  });

  it("chains generate and eject in one menu session, with a custom directory", async () => {
    const chosen = path.join(home, "docs-session");
    const fake   = createFakeProvider();
    const seen: string[] = [];

    const code = await runInteractive({
      prompts    : scripted(["generate", "es", chosen, true, "eject", "exit"]),
      cwd        : root,
      preferences: { env: { APPDATA: home }, platform: "win32", homedir: home },
      runGenerate: (target, options) =>
        runGenerate(target, options, { cwd: root, createProviders: () => [fake] }),
      runEject: async (_target, options) => {
        seen.push(options?.docs ?? "<none>");
        return runEject(root, { ...options, uiLang: "en" });
      },
    });

    expect(code).toBe(0);

    // The menu remembered the answer instead of asking again or assuming docs.
    expect(seen).toEqual([chosen]);
    expect(await exists(path.join(root, "docs"))).toBe(false);
  });
});

describe("a later scan does not forget where the pages are", () => {
  it("keeps the directory generate recorded, so eject still finds them", async () => {
    const chosen = path.join(home, "docs-kept");
    const fake   = createFakeProvider();

    await runGenerate(".", { out: chosen, quiet: true }, { cwd: root, createProviders: () => [fake] });
    await runScan(root, { json: false, write: true });

    const result = await runEject(root, { uiLang: "en" });

    expect(result.docsDir).toBe(toPosix(chosen));
  });
});

describe("the menu hint about building a site", () => {
  /** Same script runner, but it keeps the menu entries it was shown. */
  const recording = (answers: unknown[]) => {
    const port  = scripted(answers);
    const menus: SelectOption<string>[][] = [];

    return {
      menus,
      port: {
        ...port,
        select: async (options: { options: SelectOption<string>[] }) => {
          menus.push(options.options);
          return port.select(options as never);
        },
      } as PromptPort,
    };
  };

  const ejectHint = (menus: SelectOption<string>[][]): string | undefined =>
    menus[0]?.find((option) => option.value === "eject")?.hint;

  const openMenu = async (answers: unknown[]) => {
    // Pin the interface language: the hints are compared literally, and the
    // menu would otherwise follow whatever locale the machine reports.
    await write("glossic.config.ts", 'export default { uiLang: "en" };');

    const script = recording(answers);

    const code = await runInteractive({
      prompts    : script.port,
      cwd        : root,
      preferences: { env: { APPDATA: home }, platform: "win32", homedir: home },
    });

    return { code, hint: ejectHint(script.menus) };
  };

  it("offers to build from a directory a previous session recorded", async () => {
    const chosen = path.join(home, "docs-riqsi");
    const fake   = createFakeProvider();

    await runGenerate(".", { out: chosen, quiet: true }, { cwd: root, createProviders: () => [fake] });

    // A brand new session: nothing in memory, only what the manifest says.
    const { code, hint } = await openMenu(["exit"]);

    expect(code).toBe(0);
    expect(hint).toBe("structure only, no AI calls");
    expect(hint).not.toBe("generate the documentation first");
  });

  it("still says to generate first when nothing has been written anywhere", async () => {
    const { hint } = await openMenu(["exit"]);

    expect(hint).toBe("generate the documentation first");
  });
});
