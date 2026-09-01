import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DiscoverContext, Project, Unit } from "@glossic/schema";
import { GlossicConfigSchema } from "@glossic/schema";
import { afterAll, describe, expect, it } from "vitest";

import { genericAdapter, genericAdapterName } from "../index.js";

const exampleDir = (name: string): string =>
  fileURLToPath(new URL(`../../../../../examples/${name}`, import.meta.url));

/**
 * The fixtures are small enough that the default subtree merge would collapse
 * each one into a single unit, so these tests turn it off and exercise the
 * directory grouping directly. One test below covers the default.
 */
const contextFor = (root: string, rootDir = ".", mergeChildrenInto = 1): DiscoverContext => {
  const project: Project = { id: "root", name: path.basename(root), rootDir };
  return {
    root,
    project,
    config: GlossicConfigSchema.parse({ mergeChildrenInto }),
    workspace: {
      name: path.basename(root),
      root,
      isMonorepo: false,
      tool: "none",
      projects: [project],
    },
  };
};

const runAdapter = async (ctx: DiscoverContext): Promise<Unit[]> => {
  const units = await genericAdapter.discover(ctx);
  const result = await genericAdapter.extract({ ...ctx, units });
  return result.units;
};

const roleOf = (units: readonly Unit[], name: string): string | null | undefined =>
  units.find((unit) => unit.name === name)?.facts.base.roleHint;

const tempDirs: string[] = [];

const makeRepo = async (files: Record<string, string>): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-generic-"));
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

describe("generic adapter", () => {
  it("is the universal fallback", async () => {
    expect(genericAdapter.name).toBe(genericAdapterName);
    await expect(genericAdapter.detect(contextFor(exampleDir("nestjs-api")))).resolves.toBe(true);
  });

  it("groups directories holding source files into units", async () => {
    const units = await runAdapter(contextFor(exampleDir("nestjs-api")));

    // "src/common/middleware" is gone: "src" held two files, below the floor,
    // so it absorbed its first child.
    expect(units.map((unit) => unit.name)).toEqual([
      "src",
      "src/config",
      "src/users",
      "src/users/dto",
      "src/users/entities",
      "test",
    ]);
  });

  it("puts loose project-root files in a unit named root", async () => {
    const units = await runAdapter(contextFor(exampleDir("express-api")));

    expect(units.map((unit) => unit.name)).toEqual(["root", "src/routes", "src/utils"]);

    // The root unit held a single file, so it absorbed children until it hit
    // the floor of three.
    expect(units[0]?.facts.base.files.map((file) => file.path)).toEqual([
      "index.js",
      "src/controllers/users.controller.js",
      "src/middleware/error-handler.js",
    ]);
  });

  it("records file facts and language counts", async () => {
    const units = await runAdapter(contextFor(exampleDir("nestjs-api")));
    const dto = units.find((unit) => unit.name === "src/users/dto");

    expect(dto?.facts.producedBy).toEqual(["generic"]);
    expect(dto?.facts.base.files).toEqual([
      { path: "src/users/dto/create-user.dto.ts", language: "typescript", bytes: 84 },
      { path: "src/users/dto/update-user.dto.ts", language: "typescript", bytes: 84 },
    ]);
    expect(dto?.facts.base.languages).toEqual([{ language: "typescript", count: 2 }]);
  });

  it("infers role hints from nest folder names", async () => {
    const units = await runAdapter(contextFor(exampleDir("nestjs-api")));

    expect(roleOf(units, "src/users/dto")).toBe("dtos");
    expect(roleOf(units, "src/users/entities")).toBe("entities");
    expect(roleOf(units, "src/config")).toBe("config");
    expect(roleOf(units, "test")).toBe("tests");
    expect(roleOf(units, "src")).toBeNull();
    expect(roleOf(units, "src/users")).toBeNull();
  });

  it("infers role hints from laravel folder names", async () => {
    const units = await runAdapter(contextFor(exampleDir("laravel-api")));

    expect(units.map((unit) => [unit.name, unit.facts.base.roleHint])).toEqual([
      ["app/Http/Controllers", "controllers"],
      ["app/Http/Middleware", "middleware"],
      ["app/Models", "models"],
      ["routes", "routes"],
    ]);
    expect(units[0]?.facts.base.languages).toEqual([{ language: "php", count: 2 }]);
  });

  it("respects .gitignore", async () => {
    const dir = await makeRepo({
      ".gitignore": "generated/\n*.gen.ts\n",
      "package.json": '{ "name": "ignored-repo" }',
      "src/keep.ts": "export const keep = 1;\n",
      "src/skip.gen.ts": "export const skip = 1;\n",
      "generated/client.ts": "export const client = 1;\n",
      "node_modules/dep/index.js": "module.exports = {};\n",
    });

    const units = await runAdapter(contextFor(dir));

    expect(units.map((unit) => unit.name)).toEqual(["src"]);
    expect(units[0]?.facts.base.files.map((file) => file.path)).toEqual(["src/keep.ts"]);
  });

  it("respects a nested .gitignore", async () => {
    const dir = await makeRepo({
      "src/.gitignore": "vendor-copy/\n",
      "src/app.ts": "export const app = 1;\n",
      "src/vendor-copy/lib.ts": "export const lib = 1;\n",
    });

    const units = await runAdapter(contextFor(dir));

    expect(units.map((unit) => unit.name)).toEqual(["src"]);
  });

  it("scopes units and paths to the project inside a monorepo", async () => {
    const ctx = contextFor(exampleDir("monorepo"), "packages/api");
    const units = await runAdapter({ ...ctx, project: { ...ctx.project, id: "packages/api" } });

    expect(units.map((unit) => unit.id)).toEqual(["packages/api:src", "packages/api:src/services"]);
    expect(units[0]?.path).toBe("packages/api/src");
    expect(units[0]?.facts.base.files.map((file) => file.path)).toEqual([
      "packages/api/src/index.ts",
      "packages/api/src/routes/index.ts",
      "packages/api/src/routes/orders.routes.ts",
    ]);
  });

  it("collapses a whole small project into one unit by default", async () => {
    const units = await runAdapter(contextFor(exampleDir("nestjs-api"), ".", 25));

    expect(units.map((unit) => unit.name)).toEqual(["root"]);
    expect(units[0]?.facts.base.files).toHaveLength(11);
  });

  it("produces the same hashes on two consecutive runs", async () => {
    const ctx = contextFor(exampleDir("nestjs-api"));

    const first = await runAdapter(ctx);
    const second = await runAdapter(ctx);

    expect(second.map((unit) => [unit.id, unit.hash])).toEqual(
      first.map((unit) => [unit.id, unit.hash]),
    );
    expect(new Set(first.map((unit) => unit.hash)).size).toBe(first.length);
  });

  it("hashes the content, not the read order", async () => {
    const dir = await makeRepo({ "src/a.ts": "export const a = 1;\n" });
    const before = await runAdapter(contextFor(dir));

    await fs.writeFile(path.join(dir, "src/a.ts"), "export const a = 2;\n", "utf8");
    const after = await runAdapter(contextFor(dir));

    expect(after[0]?.hash).not.toBe(before[0]?.hash);
  });
});
