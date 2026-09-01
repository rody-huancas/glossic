import type { Manifest, Project, Unit } from "@glossic/schema";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

import { INDEX_DOC_PATH, renderIndexDoc, renderUnitDoc, unitDocPath } from "../markdown.js";

const project: Project = { id: "root", name: "nestjs-api", rootDir: "." };

const unit = (name: string, path: string, roleHint: Unit["facts"]["base"]["roleHint"]): Unit => ({
  id       : `root:${name}`,
  projectId: "root",
  kind     : "directory",
  name,
  path,
  facts: {
    base: {
      files       : [{ path: `${path}/a.ts`, language: "typescript", bytes: 10 }],
      testFiles   : [],
      ignoredFiles: [],
      languages   : [{ language: "typescript", count: 1 }],
      roleHint,
    },
    producedBy: ["generic"],
  },
  hash: "0f".repeat(32),
});

/** Splits a rendered document into its frontmatter block and its body. */
const splitFrontmatter = (doc: string): { frontmatter: unknown; body: string } => {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(doc);
  if (match === null) throw new Error("document has no frontmatter block");
  return { frontmatter: parseYaml(match[1] ?? ""), body: match[2] ?? "" };
};

describe("unitDocPath", () => {
  it("mirrors the source tree", () => {
    expect(unitDocPath(unit("src/users", "src/users", null))).toBe("src/users.md");
    expect(unitDocPath(unit("src", "packages/api/src", null))).toBe("packages/api/src.md");
  });

  it("gives the project root unit its own file", () => {
    expect(unitDocPath(unit("root", ".", null))).toBe("root.md");
  });
});

describe("renderUnitDoc", () => {
  it("emits parseable frontmatter", () => {
    const doc = renderUnitDoc({
      unit: unit("src/users/dto", "src/users/dto", "dtos"),
      project,
      body       : "## What it does\n\nCarries request payloads.",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    const { frontmatter, body } = splitFrontmatter(doc);

    expect(frontmatter).toEqual({
      title      : "src/users/dto",
      unit       : "root:src/users/dto",
      project    : "root",
      path       : "src/users/dto",
      role       : "dtos",
      hash       : "0f".repeat(32),
      files      : 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(body.trim().startsWith("## What it does")).toBe(true);
    expect(body).not.toContain("# src/users/dto");
  });

  it("omits role when the unit has no hint", () => {
    const doc = renderUnitDoc({
      unit: unit("src", "src", null),
      project,
      body       : "## What it does\n\nBootstraps.",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(splitFrontmatter(doc).frontmatter).not.toHaveProperty("role");
  });

  it("titles the project root unit after the project", () => {
    const doc = renderUnitDoc({
      unit: unit("root", ".", null),
      project,
      body       : "## What it does\n\nEntry point.",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(splitFrontmatter(doc).frontmatter).toMatchObject({ title: "nestjs-api" });
  });

  it("survives quotes and colons in values", () => {
    const doc = renderUnitDoc({
      unit: { ...unit('src/we"ird: name', 'src/we"ird: name', null) },
      project,
      body       : "## What it does\n\nOdd naming.",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(splitFrontmatter(doc).frontmatter).toMatchObject({ title: 'src/we"ird: name' });
  });
});

describe("renderIndexDoc", () => {
  const manifest: Manifest = {
    version    : "1",
    generatedAt: "2026-01-01T00:00:00.000Z",
    workspace: {
      name      : "nestjs-api",
      root      : "/tmp/nestjs-api",
      isMonorepo: false,
      tool      : "none",
      projects  : [project],
    },
    units    : [unit("src", "src", null), unit("src/users/dto", "src/users/dto", "dtos")],
    relations: [],
  };

  it("links every unit and parses as frontmatter + markdown", () => {
    const doc = renderIndexDoc({ manifest, generatedAt: "2026-01-01T00:00:00.000Z" });
    const { frontmatter, body } = splitFrontmatter(doc);

    expect(frontmatter).toMatchObject({ title: "nestjs-api", units: 2 });
    expect(body).toContain("[src](./src.md)");
    expect(body).toContain("[src/users/dto](./src/users/dto.md)");
    expect(body).toContain("— dtos");
    expect(INDEX_DOC_PATH).toBe("index.md");
  });
});
