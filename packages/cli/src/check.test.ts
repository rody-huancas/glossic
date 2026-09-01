import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { check, createFakeProvider, generate, readCache } from "@glossic/core";

import { GlossicConfigSchema, ProviderError } from "@glossic/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { builtinAdapters } from "./registries.js";
import { renderCheckReport } from "./render.js";

/**
 * These tests are about the cache and the checker, not the unit grouping, so
 * they keep the fixture as one unit per directory.
 */
const TREE_CONFIG = GlossicConfigSchema.parse({ mergeChildrenInto: 1 });

const tempDirs: string[] = [];

/**
 * Three files directly under src keeps it at the merge floor, so these tests
 * exercise the cache and the checker rather than the unit grouping.
 */
const SOURCES: Record<string, string> = {
  "package.json": '{ "name": "check-fixture", "type": "module" }\n',
  "src/index.ts": 'export const start = (): string => "up";\n',
  "src/server.ts": "export const server = { port: 3000 };\n",
  "src/app.ts": "export const app = { started: false };\n",
  "src/routes/users.routes.ts": "export const usersRoutes = [];\n",
  "src/routes/health.routes.ts": "export const healthRoutes = [];\n",
  "src/utils/logger.ts": "export const logger = console;\n",
  "src/utils/format.ts": "export const format = (v: string): string => v.trim();\n",
};

let root: string;
let docs: string;

const write = async (file: string, content: string): Promise<void> => {
  const target = path.join(root, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
};

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-check-"));
  tempDirs.push(root);
  docs = path.join(root, "docs");

  for (const [file, content] of Object.entries(SOURCES)) await write(file, content);
});

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

const generateAll = async () =>
  generate({
    root,
    adapters: builtinAdapters,
    config: TREE_CONFIG,
    provider: createFakeProvider(),
    outDir: docs,
    cachePath: path.join(root, ".glossic/cache.json"),
    generatedAt: "2026-01-01T00:00:00.000Z",
  });

/** Long enough to pass the document validation the pipeline now applies. */
const OK_DOCUMENT = [
  "## What it does",
  "",
  "Wires the module together and exposes its public surface.",
  "",
  "## Responsibilities",
  "",
  "It owns its own behaviour and delegates the rest to its neighbours, so the",
  "dependency direction stays one way and the boundary stays legible.",
].join("\n");

const runCheck = async () =>
  check({ root, adapters: builtinAdapters, config: TREE_CONFIG, outDir: docs });

describe("glossic check", () => {
  it("is happy right after a generate", async () => {
    await generateAll();
    const result = await runCheck();

    expect(result.ok).toBe(true);
    expect(result.upToDate).toHaveLength(3);
    expect(result.missing).toEqual([]);
    expect(result.stale).toEqual([]);
    expect(result.orphaned).toEqual([]);
    expect(renderCheckReport(result, { cwd: root, target: "." })).toContain("up to date");
  });

  it("reports an undocumented unit", async () => {
    await generateAll();
    await write("src/services/orders.service.ts", "export const listOrders = () => [];\n");

    const result = await runCheck();

    expect(result.ok).toBe(false);
    expect(result.missing.map((entry) => entry.unitId)).toEqual(["root:src/services"]);
    expect(result.missing[0]?.docPath).toBe("src/services.md");

    const report = renderCheckReport(result, { cwd: root, target: "." });
    expect(report).toContain("missing");
    expect(report).toContain("docs/src/services.md");
  });

  it("reports a stale document", async () => {
    await generateAll();
    await write("src/utils/logger.ts", "export const logger = { info: console.log };\n");

    const result = await runCheck();

    expect(result.ok).toBe(false);
    expect(result.stale.map((entry) => entry.unitId)).toEqual(["root:src/utils"]);
    expect(result.stale[0]?.documentedHash).not.toBe(result.stale[0]?.expectedHash);

    const report = renderCheckReport(result, { cwd: root, target: "." });
    expect(report).toContain("stale");
    expect(report).toContain("docs/src/utils.md");
    expect(report).toContain("glossic generate .");
  });

  it("reports an orphaned document", async () => {
    await generateAll();
    await fs.rm(path.join(root, "src/routes"), { force: true, recursive: true });

    const result = await runCheck();

    expect(result.ok).toBe(false);
    expect(result.orphaned).toEqual(["src/routes.md"]);

    const report = renderCheckReport(result, { cwd: root, target: "." });
    expect(report).toContain("orphaned");
    expect(report).toContain("rm docs/src/routes.md");
  });

  it("reports all three problems at once and names every file", async () => {
    await generateAll();
    await write("src/utils/logger.ts", "export const logger = { info: console.log };\n");
    await write("src/services/orders.service.ts", "export const listOrders = () => [];\n");
    await fs.rm(path.join(root, "src/routes"), { force: true, recursive: true });

    const result = await runCheck();

    expect(result.stale.map((entry) => entry.docPath)).toEqual(["src/utils.md"]);
    expect(result.missing.map((entry) => entry.docPath)).toEqual(["src/services.md"]);
    expect(result.orphaned).toEqual(["src/routes.md"]);
    expect(result.ok).toBe(false);

    const report = renderCheckReport(result, { cwd: root, target: "." });
    for (const file of ["docs/src/utils.md", "docs/src/services.md", "docs/src/routes.md"]) {
      expect(report).toContain(file);
    }
    expect(report).toContain("3 problems");
  });

  it("treats an undocumented docs directory as everything missing", async () => {
    const result = await runCheck();

    expect(result.ok).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.orphaned).toEqual([]);
  });

  it("ignores the index and treats a doc without frontmatter as stale", async () => {
    await generateAll();
    await fs.writeFile(path.join(docs, "src/utils.md"), "no frontmatter here\n", "utf8");

    const result = await runCheck();

    expect(result.orphaned).toEqual([]);
    expect(result.stale.map((entry) => entry.unitId)).toEqual(["root:src/utils"]);
    expect(result.stale[0]?.documentedHash).toBeUndefined();
  });

  it("is serializable for --json", async () => {
    await generateAll();
    const result = await runCheck();

    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({ ok: true });
  });
});

describe("a failing unit does not abort the run", () => {
  it("documents the rest and reports the failure", async () => {
    const provider = createFakeProvider({
      respond: (request) => {
        if (request.metadata.unitId === "root:src/utils") {
          throw new ProviderError({
            provider: "fake",
            code: "refused",
            message: "the model declined to answer",
          });
        }
        return OK_DOCUMENT;
      },
    });

    const result = await generate({
      root,
      adapters: builtinAdapters,
      config: TREE_CONFIG,
      provider,
      outDir: docs,
      cachePath: path.join(root, ".glossic/cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
      retry: { sleep: async () => {} },
    });

    expect(result.generated).toBe(2);
    expect(result.failures).toEqual([
      { unitId: "root:src/utils", reason: "the model declined to answer", code: "refused" },
    ]);
    expect(result.written).toEqual(["index.md", "src.md", "src/routes.md"]);

    // The failed unit must not be cached, so the next run retries it.
    const next = await check({
      root,
      adapters: builtinAdapters,
      config: TREE_CONFIG,
      outDir: docs,
    });
    expect(next.missing.map((entry) => entry.unitId)).toEqual(["root:src/utils"]);
  });

  it("retries a transient failure and succeeds", async () => {
    let attempts = 0;

    const provider = createFakeProvider({
      respond: (request) => {
        if (request.metadata.unitId === "root:src/utils") {
          attempts += 1;
          if (attempts < 3) {
            throw new ProviderError({
              provider: "fake",
              code: "rate-limit",
              message: "slow down",
            });
          }
        }
        return OK_DOCUMENT;
      },
    });

    const result = await generate({
      root,
      adapters: builtinAdapters,
      config: TREE_CONFIG,
      provider,
      outDir: docs,
      cachePath: path.join(root, ".glossic/cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
      retry: { sleep: async () => {} },
    });

    expect(attempts).toBe(3);
    expect(result.failures).toEqual([]);
    expect(result.generated).toBe(3);
  });

  it("does not retry a refusal", async () => {
    let attempts = 0;

    const provider = createFakeProvider({
      respond: () => {
        attempts += 1;
        throw new ProviderError({
          provider: "fake",
          code: "refused",
          message: "the model declined to answer",
        });
      },
    });

    const result = await generate({
      root,
      adapters: builtinAdapters,
      config: TREE_CONFIG,
      provider,
      outDir: docs,
      cachePath: path.join(root, ".glossic/cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
      retry: { sleep: async () => {} },
    });

    // Three units, one attempt each: a refusal is never repeated.
    expect(attempts).toBe(3);
    expect(result.failures).toHaveLength(3);
    expect(result.generated).toBe(0);
  });
});

describe("a conversational answer never reaches disk", () => {
  /** The exact reply that shipped a broken document before validation existed. */
  const CHAT_REPLY = "I've drafted the documentation but need write permission to save it.";

  const cachePath = () => path.join(root, ".glossic/cache.json");

  const generateWith = async (respond: (unitId: unknown) => string) =>
    generate({
      root,
      adapters: builtinAdapters,
      config: TREE_CONFIG,
      provider: createFakeProvider({ respond: (request) => respond(request.metadata.unitId) }),
      outDir: docs,
      cachePath: cachePath(),
      generatedAt: "2026-01-01T00:00:00.000Z",
      retry: { sleep: async () => {} },
    });

  const document = (unitId: unknown): string =>
    `## What it does

${`The ${String(unitId)} unit wires the module together. `.repeat(8)}`;

  it("fails the unit with invalid-content instead of writing it", async () => {
    const result = await generateWith((unitId) =>
      unitId === "root:src/utils" ? CHAT_REPLY : document(unitId),
    );

    expect(result.failures).toEqual([
      {
        unitId: "root:src/utils",
        reason: expect.stringContaining("not a document") as unknown as string,
        code: "invalid-content",
        detail: expect.any(String) as unknown as string,
      },
    ]);
    expect(result.written).not.toContain("src/utils.md");
    await expect(fs.readFile(path.join(docs, "src/utils.md"), "utf8")).rejects.toThrow();
  });

  it("leaves the failed unit out of the cache so the next run retries it", async () => {
    await generateWith((unitId) => (unitId === "root:src/utils" ? CHAT_REPLY : document(unitId)));

    const cache = await readCache(cachePath());
    expect(cache.entries.map((entry) => entry.unitId)).toEqual(["root:src", "root:src/routes"]);

    // Second run: the provider behaves, and only the failed unit is asked for.
    const second = await generateWith(document);
    expect(second.plan.filter((entry) => entry.regenerate).map((entry) => entry.unitId)).toEqual([
      "root:src/utils",
    ]);
    expect(second.failures).toEqual([]);
  });

  it("is never retried, because the same prompt gives the same answer", async () => {
    let calls = 0;
    const provider = createFakeProvider({
      respond: () => {
        calls += 1;
        return CHAT_REPLY;
      },
    });

    await generate({
      root,
      adapters: builtinAdapters,
      config: TREE_CONFIG,
      provider,
      outDir: docs,
      cachePath: cachePath(),
      generatedAt: "2026-01-01T00:00:00.000Z",
      retry: { sleep: async () => {} },
    });

    // Three units, one attempt each.
    expect(calls).toBe(3);
  });
});

describe("a preamble is trimmed rather than rejected", () => {
  const PREAMBLE = "The working directory is empty, so this comes from the sources given.";

  it("writes the document, reports a warning and keeps the unit cached", async () => {
    const result = await generate({
      root,
      adapters: builtinAdapters,
      config: TREE_CONFIG,
      provider: createFakeProvider({
        respond: (request) =>
          request.metadata.unitId === "root:src/utils"
            ? `${PREAMBLE}\n\n# Utils\n\n${OK_DOCUMENT}`
            : OK_DOCUMENT,
      }),
      outDir: docs,
      cachePath: path.join(root, ".glossic/cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
      retry: { sleep: async () => {} },
    });

    expect(result.failures).toEqual([]);
    expect(result.written).toContain("src/utils.md");
    expect(result.warnings).toEqual([
      {
        unitId: "root:src/utils",
        message: expect.stringContaining("before the first heading") as unknown as string,
      },
    ]);

    const doc = await fs.readFile(path.join(docs, "src/utils.md"), "utf8");
    expect(doc).not.toContain(PREAMBLE);

    // The frontmatter title is the only h1 the page carries.
    const body = doc.slice(doc.indexOf("---", 3) + 3);
    expect(body.split("\n").filter((line) => /^#\s/.test(line))).toEqual(["# src/utils"]);
    expect(body).toContain("## Utils");
  });

  it("reports no warning when nothing needed trimming", async () => {
    const result = await generate({
      root,
      adapters: builtinAdapters,
      config: TREE_CONFIG,
      provider: createFakeProvider(),
      outDir: docs,
      cachePath: path.join(root, ".glossic/cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result.warnings).toEqual([]);
  });
});
