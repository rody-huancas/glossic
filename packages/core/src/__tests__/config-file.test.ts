import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { findConfigFile, loadProjectConfig } from "../config-file.js";

const tempDirs: string[] = [];

const project = async (files: Record<string, string> = {}): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-config-"));
  tempDirs.push(root);

  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(root, name), content, "utf8");
  }

  return root;
};

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

describe("findConfigFile", () => {
  it("finds nothing in a project without one", async () => {
    await expect(findConfigFile(await project())).resolves.toBeUndefined();
  });

  it("prefers glossic.config.ts over the other extensions", async () => {
    const root = await project({
      "glossic.config.ts": "export default {};",
      "glossic.config.js": "export default {};",
    });

    await expect(findConfigFile(root)).resolves.toContain("glossic.config.ts");
  });
});

describe("loadProjectConfig", () => {
  it("reads the values a TypeScript config exports", async () => {
    const root = await project({
      "glossic.config.ts": 'export default { lang: "pt", concurrency: 5 };\n',
    });

    const loaded = await loadProjectConfig(root);

    expect(loaded.status).toBe("loaded");
    expect(loaded).toMatchObject({ values: { lang: "pt", concurrency: 5 } });
    expect(loaded).toHaveProperty("file", expect.stringContaining("glossic.config.ts"));
  });

  it("keeps only the keys the file actually set", async () => {
    const root   = await project({ "glossic.config.ts": 'export default { lang: "fr" };\n' });
    const loaded = await loadProjectConfig(root);

    // The schema would happily fill in every default, which would then beat
    // the lower-priority sources it is supposed to lose to.
    expect(loaded.status === "loaded" ? Object.keys(loaded.values) : []).toEqual(["lang"]);
  });

  it("loads a config that sets nothing instead of calling it missing", async () => {
    const root   = await project({ "glossic.config.ts": "export default {\n  // lang: 'es',\n};\n" });
    const loaded = await loadProjectConfig(root);

    expect(loaded.status).toBe("loaded");
    expect(loaded).toMatchObject({ values: {} });
  });

  it("says a project has no config when it has none", async () => {
    await expect(loadProjectConfig(await project())).resolves.toEqual({ status: "missing" });
  });

  it("reports the reason when the config throws", async () => {
    const root = await project({
      "glossic.config.ts": 'throw new Error("boom");\n',
    });

    const loaded = await loadProjectConfig(root);

    expect(loaded.status).toBe("failed");
    expect(loaded).toMatchObject({ error: "boom" });
    expect(loaded).toHaveProperty("file", expect.stringContaining("glossic.config.ts"));
  });

  it("reports a failure, not an absence, when the config imports a package that is not there", async () => {
    // The bug this exists for: a config that imports something the project it
    // sits in never installed used to read as "no config file at all".
    const root = await project({
      "glossic.config.ts":
        'import { defineConfig } from "@glossic/not-a-real-package";\n' +
        'export default defineConfig({ lang: "pt" });\n',
    });

    const loaded = await loadProjectConfig(root);

    expect(loaded.status).toBe("failed");
    expect(loaded).toMatchObject({ error: expect.stringContaining("@glossic/not-a-real-package") });
  });

  it("reports which key is wrong when the config exports something invalid", async () => {
    const root   = await project({ "glossic.config.ts": "export default { lang: 42 };\n" });
    const loaded = await loadProjectConfig(root);

    expect(loaded.status).toBe("failed");
    expect(loaded).toMatchObject({ error: expect.stringContaining("lang") });
  });

  it("reports a failure when the config exports no object", async () => {
    const root   = await project({ "glossic.config.ts": "export default 7;\n" });
    const loaded = await loadProjectConfig(root);

    expect(loaded.status).toBe("failed");
    expect(loaded).toMatchObject({ error: expect.stringMatching(/./) });
  });
});
