import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { check, createFakeProvider, generate } from "@glosik/core";

import { ProviderError } from "@glosik/schema";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { builtinAdapters } from "./registries.js";
import { renderCheckReport } from "./render.js";

const tempDirs: string[] = [];

const SOURCES: Record<string, string> = {
  "package.json": '{ "name": "check-fixture", "type": "module" }\n',
  "src/index.ts": 'export const start = (): string => "up";\n',
  "src/routes/users.routes.ts": "export const usersRoutes = [];\n",
  "src/utils/logger.ts": "export const logger = console;\n",
};

let root: string;
let docs: string;

const write = async (file: string, content: string): Promise<void> => {
  const target = path.join(root, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
};

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "glosik-check-"));
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
    provider: createFakeProvider(),
    outDir: docs,
    cachePath: path.join(root, ".glosik/cache.json"),
    generatedAt: "2026-01-01T00:00:00.000Z",
  });

const runCheck = async () => check({ root, adapters: builtinAdapters, outDir: docs });

describe("glosik check", () => {
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
    expect(report).toContain("glosik generate .");
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
        return "## Summary\n\nok";
      },
    });

    const result = await generate({
      root,
      adapters: builtinAdapters,
      provider,
      outDir: docs,
      cachePath: path.join(root, ".glosik/cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
      retry: { sleep: async () => {} },
    });

    expect(result.generated).toBe(2);
    expect(result.failures).toEqual([
      { unitId: "root:src/utils", reason: "the model declined to answer", code: "refused" },
    ]);
    expect(result.written).toEqual(["index.md", "src.md", "src/routes.md"]);

    // The failed unit must not be cached, so the next run retries it.
    const next = await check({ root, adapters: builtinAdapters, outDir: docs });
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
        return "## Summary\n\nok";
      },
    });

    const result = await generate({
      root,
      adapters: builtinAdapters,
      provider,
      outDir: docs,
      cachePath: path.join(root, ".glosik/cache.json"),
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
      provider,
      outDir: docs,
      cachePath: path.join(root, ".glosik/cache.json"),
      generatedAt: "2026-01-01T00:00:00.000Z",
      retry: { sleep: async () => {} },
    });

    // Three units, one attempt each: a refusal is never repeated.
    expect(attempts).toBe(3);
    expect(result.failures).toHaveLength(3);
    expect(result.generated).toBe(0);
  });
});
