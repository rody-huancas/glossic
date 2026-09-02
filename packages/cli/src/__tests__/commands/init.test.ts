import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { loadProjectConfig } from "@glossic/core";
import { afterAll, describe, expect, it } from "vitest";

import { runInit } from "../../commands/init.js";

const tempDirs: string[] = [];

/**
 * Under the OS temp directory on purpose: the generated config has to load in
 * a project that installed nothing, which is every project that runs glossic
 * from a global install or a package manager that does not hoist.
 */
const project = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-init-"));
  tempDirs.push(root);

  await fs.writeFile(path.join(root, "package.json"), '{ "name": "init-demo" }', "utf8");

  return root;
};

const written = async (root: string): Promise<string> =>
  fs.readFile(path.join(root, "glossic.config.ts"), "utf8");

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

describe("glossic init", () => {
  it("writes glossic.config.ts and refuses to overwrite it", async () => {
    const root = await project();

    await expect(runInit(root, false)).resolves.toContain("glossic.config.ts");
    await expect(runInit(root, false)).rejects.toThrow("already exists");
    await expect(runInit(root, true)).resolves.toContain("glossic.config.ts");
  });

  it("imports nothing at run time, so nothing has to be installed for it to load", async () => {
    const root = await project();
    await runInit(root, false);

    const source = await written(root);

    // `satisfies` and an inline `import(...)` type, so the annotation is a type
    // an editor can check and never a module the project has to resolve.
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toContain("require(");
    expect(source).toContain('} satisfies import("@glossic/schema").GlossicUserConfig;');
  });

  it("produces a config that loads in a project with no node_modules", async () => {
    const root = await project();
    await runInit(root, false);

    const loaded = await loadProjectConfig(root);

    // Every option ships commented out, so a fresh config is a valid one that
    // happens to decide nothing.
    expect(loaded.status).toBe("loaded");
    expect(loaded).toMatchObject({ values: {} });
  });

  it("produces a config that takes effect once an option is uncommented", async () => {
    const root = await project();
    await runInit(root, false);

    const source = await written(root);
    await fs.writeFile(
      path.join(root, "glossic.config.ts"),
      source.replace('  // lang: "en",', '  lang: "pt",'),
      "utf8",
    );

    expect(await loadProjectConfig(root)).toMatchObject({
      status: "loaded",
      values: { lang: "pt" },
    });
  });
});
