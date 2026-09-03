import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { createFakeProvider } from "@glossic/core";
import type { FakeProvider } from "@glossic/core";
import type { CompletionRequest, Provider } from "@glossic/schema";
import { ProviderError } from "@glossic/schema";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runGenerate } from "../../commands/generate/index.js";
import { BACK } from "../../interactive/nav.js";
import type { PromptPort } from "../../ui/prompts.js";

const tempDirs: string[] = [];

/** Long enough to pass the document validation the pipeline applies. */
const OK_DOCUMENT = [
  "## What it does",
  "",
  "Wires the unit together and exposes the surface the rest of the workspace",
  "reaches it through.",
  "",
  "## Responsibilities",
  "",
  "It owns its own behaviour and delegates the rest to its neighbours, so the",
  "dependency direction stays one way and the boundary stays legible.",
].join("\n");

/**
 * A pnpm workspace with two projects of three files each, which the generic
 * adapter turns into one unit per project. Two units is over any threshold a
 * test cares to set, and small enough that a fake provider answers instantly.
 */
const SOURCES: Record<string, string> = {
  "package.json"       : '{ "name": "big-fixture", "private": true }',
  "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',

  "packages/api/package.json"  : '{ "name": "@big/api" }',
  "packages/api/src/index.ts"  : "export const start = 1;",
  "packages/api/src/routes.ts" : "export const routes = 2;",
  "packages/api/src/orders.ts" : "export const orders = 3;",

  "packages/web/package.json"  : '{ "name": "@big/web" }',
  "packages/web/src/main.ts"   : "export const main = 1;",
  "packages/web/src/button.ts" : "export const button = 2;",
  "packages/web/src/list.ts"   : "export const list = 3;",
};

let root  : string;
let stdout: string[];

beforeEach(async () => {
  root   = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-plan-"));
  stdout = [];
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
});

afterEach(() => {
  vi.restoreAllMocks();

  // A failed unit sets it, and a leaked non-zero code fails the whole test run.
  process.exitCode = 0;
});

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

/** Everything the run printed, as one string. */
const printed = (): string => stdout.join("");

/** Records every question asked and answers from a script. */
const scripted = (answers: unknown[]) => {
  const asked: string[] = [];
  let cursor            = 0;

  const next = async (options: { message: string }): Promise<never> => {
    asked.push(options.message);

    if (cursor >= answers.length) throw new Error(`nothing scripted for "${options.message}"`);

    return answers[cursor++] as never;
  };

  const port: PromptPort = {
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

  return { asked, port };
};

const withConfig = async (values: string): Promise<void> => {
  await fs.writeFile(path.join(root, "glossic.config.ts"), `export default { ${values} };\n`, "utf8");
};

/** The unit ids the provider was actually asked to write. */
const askedFor = (provider: { calls: CompletionRequest[] }): string[] =>
  provider.calls.map((call) => String(call.metadata.unitId)).sort();

const run = (deps: { prompts?: PromptPort; provider?: Provider } = {}) =>
  runGenerate(
    ".",
    { uiLang: "en" },
    {
      cwd            : root,
      createProviders: () => [deps.provider ?? createFakeProvider()],
      ...(deps.prompts === undefined ? {} : { prompts: deps.prompts }),
    },
  );

describe("a plan bigger than the workspace wants to pay for in one go", () => {
  it("says how big it is and what that risks, before anything is sent", async () => {
    await withConfig('warnAboveUnits: 1');

    await run();

    expect(printed()).toContain("This project has 2 units");
    expect(printed()).toContain("may exhaust your quota");
  });

  it("asks nothing where there is nobody to ask, and generates anyway", async () => {
    await withConfig('warnAboveUnits: 1');

    const provider = createFakeProvider();
    await run({ provider });

    // No prompt port: a CI log is warned and the run carries on.
    expect(askedFor(provider)).toEqual(["packages/api:src", "packages/web:src"]);
  });

  it("asks how to generate it when there is someone to ask", async () => {
    await withConfig('warnAboveUnits: 1');

    const prompts  = scripted(["all"]);
    const provider = createFakeProvider();

    await run({ prompts: prompts.port, provider });

    expect(prompts.asked).toEqual(["How do you want to generate it?"]);
    expect(askedFor(provider)).toEqual(["packages/api:src", "packages/web:src"]);
  });

  it("stays quiet and sends everything when the plan is under the threshold", async () => {
    await withConfig('warnAboveUnits: 30');

    const prompts  = scripted([]);
    const provider = createFakeProvider();

    await run({ prompts: prompts.port, provider });

    expect(prompts.asked).toEqual([]);
    expect(printed()).not.toContain("may exhaust your quota");
    expect(askedFor(provider)).toEqual(["packages/api:src", "packages/web:src"]);
  });

  it("takes the threshold from the project's config", async () => {
    await withConfig('warnAboveUnits: 2');

    const prompts = scripted([]);
    await run({ prompts: prompts.port });

    // Two units is not *above* two.
    expect(prompts.asked).toEqual([]);
    expect(printed()).not.toContain("This project has");
  });

  it("sends nothing at all when the answer is to cancel", async () => {
    await withConfig('warnAboveUnits: 1');

    const provider = createFakeProvider();
    await run({ prompts: scripted(["cancel"]).port, provider });

    expect(provider.calls).toEqual([]);
  });
});

describe("generating one project at a time", () => {
  it("sends only the chosen project, then offers the list again", async () => {
    await withConfig('warnAboveUnits: 1');

    const prompts  = scripted(["by-project", "packages/api", "packages/web"]);
    const provider = createFakeProvider();

    await run({ prompts: prompts.port, provider });

    // Twice, not three times: with the second project chosen there is nothing
    // left to offer, so the loop ends instead of asking about nothing.
    expect(prompts.asked).toEqual([
      "How do you want to generate it?",
      "Which project?",
      "Which project?",
    ]);
    expect(askedFor(provider)).toEqual(["packages/api:src", "packages/web:src"]);
  });

  it("plans only the chosen project on the pass that generates it", async () => {
    await withConfig('warnAboveUnits: 1');

    const provider = createFakeProvider();
    await run({ prompts: scripted(["by-project", "packages/api", BACK]).port, provider });

    expect(askedFor(provider)).toEqual(["packages/api:src"]);

    const pages = await fs.readdir(path.join(root, "docs", "packages"));
    expect(pages).toEqual(["api"]);
  });

  it("comes back to a project it already generated with nothing left to do", async () => {
    await withConfig('warnAboveUnits: 1');

    await run({ prompts: scripted(["by-project", "packages/api", BACK]).port });

    // The second run reads the cache the first one wrote: one unit is pending.
    const provider = createFakeProvider();
    await run({ prompts: scripted(["by-project", "packages/web", BACK]).port, provider });

    expect(printed()).toContain("1 units pending, 1 already generated");
    expect(askedFor(provider)).toEqual(["packages/web:src"]);
  });
});

describe("when the quota runs out mid-run", () => {
  /** Spends the quota on the first unit it is asked for, whichever that is. */
  const spent = (): FakeProvider => {
    let first = true;

    return createFakeProvider({
      respond: () => {
        if (first) {
          first = false;
          throw new ProviderError({
            provider: "fake",
            code    : "quota",
            message : "Claude AI usage limit reached",
          });
        }

        return OK_DOCUMENT;
      },
    });
  };

  it("asks what to do and stops there when told to", async () => {
    await withConfig('warnAboveUnits: 30, concurrency: 1');

    const prompts = scripted(["stop"]);
    await run({ prompts: prompts.port, provider: spent() });

    expect(prompts.asked[0]).toContain("The provider ran out of quota");
    expect(prompts.asked[0]).toContain("0 of 2 units generated");
  });

  it("picks up where it stopped when told to retry", async () => {
    await withConfig('warnAboveUnits: 30, concurrency: 1');

    const provider = spent();
    await run({ prompts: scripted(["retry"]).port, provider });

    // The first pass spent the quota on one unit and skipped the other; the
    // retry sends both, because neither of them reached the cache.
    expect(provider.calls).toHaveLength(3);
    expect(printed()).toContain("2 generated");
  });

  it("leaves a later run only the units it never reached", async () => {
    await withConfig('warnAboveUnits: 30, concurrency: 1');

    // The first unit lands, the second spends the quota.
    let answered = false;

    const first = createFakeProvider({
      respond: () => {
        if (answered) {
          throw new ProviderError({
            provider: "fake",
            code    : "quota",
            message : "Claude AI usage limit reached",
          });
        }

        answered = true;
        return OK_DOCUMENT;
      },
    });

    await run({ provider: first });

    expect(askedFor(first)).toEqual(["packages/api:src", "packages/web:src"]);

    const later = createFakeProvider();
    await run({ provider: later });

    // The unit the first run paid for is cached; only the other one is sent.
    expect(askedFor(later)).toEqual(["packages/web:src"]);
    expect(printed()).toContain("1 units pending, 1 already generated");
  });

  it("says nothing and returns where there is nobody to ask", async () => {
    await withConfig('warnAboveUnits: 30, concurrency: 1');

    const provider = spent();
    const result   = await run({ provider });

    expect(result.aborted?.code).toBe("quota");
    expect(provider.calls).toHaveLength(1);
  });
});
