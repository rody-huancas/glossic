import type { ExtractResult, Unit, Workspace } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import { buildManifest, serializeManifest } from "../manifest.js";

const workspace: Workspace = {
  name      : "demo",
  root      : "/tmp/demo",
  isMonorepo: false,
  tool      : "none",
  projects: [
    { id: "root", name: "demo", rootDir: "." },
    { id: "a", name: "a", rootDir: "a" },
  ],
};

const unit = (id: string, files: string[]): Unit => ({
  id,
  projectId: "root",
  kind     : "directory",
  name     : id,
  path     : id,
  facts: {
    base: {
      files       : files.map((file) => ({ path: file, language: "typescript", bytes: file.length })),
      testFiles   : [],
      ignoredFiles: [],
      languages   : [{ language: "typescript", count: files.length }],
      roleHint    : null,
    },
    producedBy: ["generic"],
  },
  hash: `hash-${id}`,
});

const results: ExtractResult[] = [
  {
    units: [unit("zeta", ["z/b.ts", "z/a.ts"]), unit("alpha", ["a/a.ts"])],
    relations: [
      { from: "zeta", to: "alpha", kind: "imports" },
      { from: "alpha", to: "zeta", kind: "calls" },
    ],
  },
];

describe("buildManifest", () => {
  it("sorts projects, units, relations and files", () => {
    const manifest = buildManifest(workspace, results, { generatedAt: "2026-01-01T00:00:00.000Z" });

    expect(manifest.workspace.projects.map((project) => project.id)).toEqual(["a", "root"]);
    expect(manifest.units.map((entry) => entry.id)).toEqual(["alpha", "zeta"]);
    expect(manifest.relations.map((relation) => relation.from)).toEqual(["alpha", "zeta"]);
    expect(manifest.units[1]?.facts.base.files.map((file) => file.path)).toEqual([
      "z/a.ts",
      "z/b.ts",
    ]);
  });

  it("orders languages by count, then by name", () => {
    const mixed: ExtractResult[] = [
      {
        units: [
          {
            ...unit("mixed", ["a.ts"]),
            facts: {
              base: {
                files       : [{ path: "a.ts", language: "typescript", bytes: 1 }],
                testFiles   : [],
                ignoredFiles: [],
                languages: [
                  { language: "tsx", count: 2 },
                  { language: "shell", count: 5 },
                  { language: "php", count: 2 },
                ],
                roleHint: null,
              },
              producedBy: ["generic"],
            },
          },
        ],
        relations: [],
      },
    ];

    const manifest = buildManifest(workspace, mixed, { generatedAt: "2026-01-01T00:00:00.000Z" });

    expect(manifest.units[0]?.facts.base.languages).toEqual([
      { language: "shell", count: 5 },
      { language: "php", count: 2 },
      { language: "tsx", count: 2 },
    ]);
  });

  it("is byte-identical across runs except for generatedAt", () => {
    const first  = buildManifest(workspace, results, { generatedAt: "2026-01-01T00:00:00.000Z" });
    const second = buildManifest(workspace, results, { generatedAt: "2026-06-30T12:00:00.000Z" });

    const strip = (value: string): string => value.replace(/"generatedAt": "[^"]+"/, "");

    expect(strip(serializeManifest(first))).toBe(strip(serializeManifest(second)));
    expect(serializeManifest(first)).not.toBe(serializeManifest(second));
  });

  it("serializes with two spaces and a trailing newline", () => {
    const json = serializeManifest(
      buildManifest(workspace, [], { generatedAt: "2026-01-01T00:00:00.000Z" }),
    );

    expect(json.startsWith('{\n  "version"')).toBe(true);
    expect(json.endsWith("\n")).toBe(true);
  });
});
