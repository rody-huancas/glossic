import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { exampleDir } from "../test-utils.js";
import { resolveWorkspace } from "../workspace.js";

const tempDirs: string[] = [];

const makeRepo = async (files: Record<string, string>): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-ws-"));
  tempDirs.push(dir);

  for (const [file, content] of Object.entries(files)) {
    const target = path.join(dir, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf8");
  }

  return dir;
};

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

describe("resolveWorkspace", () => {
  it("detects a pnpm monorepo with two projects", async () => {
    const workspace = await resolveWorkspace(exampleDir("monorepo"));

    expect(workspace.isMonorepo).toBe(true);
    expect(workspace.tool).toBe("pnpm");
    expect(workspace.packageManager).toBe("pnpm");
    expect(workspace.projects).toEqual([
      { id: "packages/api", name: "@example/api", rootDir: "packages/api", packageManager: "pnpm" },
      { id: "packages/web", name: "@example/web", rootDir: "packages/web", packageManager: "pnpm" },
    ]);
  });

  it("falls back to a single root project", async () => {
    const workspace = await resolveWorkspace(exampleDir("nestjs-api"));

    expect(workspace.isMonorepo).toBe(false);
    expect(workspace.tool).toBe("none");
    expect(workspace.projects).toEqual([{ id: "root", name: "nestjs-api", rootDir: "." }]);
  });

  it("infers composer for a php project", async () => {
    const workspace = await resolveWorkspace(exampleDir("laravel-api"));

    expect(workspace.packageManager).toBe("composer");
    expect(workspace.projects).toEqual([
      { id: "root", name: "laravel-api", rootDir: ".", packageManager: "composer" },
    ]);
  });

  it("reads the workspaces field of package.json", async () => {
    const dir = await makeRepo({
      "package.json": JSON.stringify({ name: "npm-repo", workspaces: ["apps/*"] }),
      "apps/site/package.json": JSON.stringify({ name: "site" }),
    });

    const workspace = await resolveWorkspace(dir);

    expect(workspace.tool).toBe("npm-workspaces");
    expect(workspace.projects.map((project) => project.id)).toEqual(["apps/site"]);
  });

  it("prefers pnpm-workspace.yaml over the other markers", async () => {
    const dir = await makeRepo({
      "pnpm-workspace.yaml": 'packages:\n  - "libs/*"\n',
      "package.json": JSON.stringify({ name: "mixed", workspaces: ["apps/*"] }),
      "turbo.json": "{}",
      "nx.json": "{}",
      "lerna.json": JSON.stringify({ packages: ["modules/*"] }),
      "libs/one/package.json": JSON.stringify({ name: "one" }),
      "apps/two/package.json": JSON.stringify({ name: "two" }),
    });

    const workspace = await resolveWorkspace(dir);

    expect(workspace.tool).toBe("pnpm");
    expect(workspace.projects.map((project) => project.id)).toEqual(["libs/one"]);
  });

  it("falls back to turbo, then nx, then lerna", async () => {
    const turbo = await resolveWorkspace(
      await makeRepo({
        "turbo.json": "{}",
        "packages/a/package.json": JSON.stringify({ name: "a" }),
      }),
    );
    expect(turbo.tool).toBe("turbo");

    const nx = await resolveWorkspace(
      await makeRepo({
        "nx.json": "{}",
        "libs/b/package.json": JSON.stringify({ name: "b" }),
      }),
    );
    expect(nx.tool).toBe("nx");
    expect(nx.projects.map((project) => project.id)).toEqual(["libs/b"]);

    const lerna = await resolveWorkspace(
      await makeRepo({
        "lerna.json": JSON.stringify({ packages: ["modules/*"] }),
        "modules/c/package.json": JSON.stringify({ name: "c" }),
      }),
    );
    expect(lerna.tool).toBe("lerna");
    expect(lerna.projects.map((project) => project.id)).toEqual(["modules/c"]);
  });

  it("ignores a marker whose globs match nothing", async () => {
    const dir = await makeRepo({
      "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n',
      "package.json": JSON.stringify({ name: "empty-repo" }),
    });

    const workspace = await resolveWorkspace(dir);

    expect(workspace.isMonorepo).toBe(false);
    expect(workspace.projects.map((project) => project.id)).toEqual(["root"]);
  });
});
