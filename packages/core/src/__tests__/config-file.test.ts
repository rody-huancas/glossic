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

    expect(loaded?.values.lang).toBe("pt");
    expect(loaded?.values.concurrency).toBe(5);
    expect(loaded?.file).toContain("glossic.config.ts");
  });

  it("keeps only the keys the file actually set", async () => {
    const root = await project({ "glossic.config.ts": 'export default { lang: "fr" };\n' });
    const loaded = await loadProjectConfig(root);

    // The schema would happily fill in every default, which would then beat
    // the lower-priority sources it is supposed to lose to.
    expect(Object.keys(loaded?.values ?? {})).toEqual(["lang"]);
  });

  it("returns nothing when there is no config", async () => {
    await expect(loadProjectConfig(await project())).resolves.toBeUndefined();
  });

  it("returns nothing when the config throws", async () => {
    const root = await project({
      "glossic.config.ts": 'throw new Error("boom");\n',
    });

    await expect(loadProjectConfig(root)).resolves.toBeUndefined();
  });

  it("returns nothing when the config exports something invalid", async () => {
    const root = await project({ "glossic.config.ts": "export default { lang: 42 };\n" });
    await expect(loadProjectConfig(root)).resolves.toBeUndefined();
  });

  it("returns nothing when the config exports no object", async () => {
    const root = await project({ "glossic.config.ts": "export default 7;\n" });
    await expect(loadProjectConfig(root)).resolves.toBeUndefined();
  });
});
