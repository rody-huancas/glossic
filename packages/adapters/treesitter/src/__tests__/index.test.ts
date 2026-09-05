import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GlossicConfigSchema } from "@glossic/schema";
import type { DiscoverContext, EnrichContext, FileFact, Unit } from "@glossic/schema";
import { afterAll, describe, expect, it } from "vitest";

import { disposeGrammars } from "../grammars.js";
import { MAX_PARSE_BYTES } from "../languages.js";
import { treesitterAdapter, treesitterAdapterName } from "../index.js";

const ROOT = fileURLToPath(new URL("../__fixtures__/project", import.meta.url));

const LANGUAGES: Readonly<Record<string, string>> = {
  ".js" : "javascript",
  ".ts" : "typescript",
  ".tsx": "tsx",
};

const fact = async (file: string): Promise<FileFact> => {
  const { size } = await fs.stat(path.resolve(ROOT, file));

  return {
    path    : file,
    language: LANGUAGES[path.extname(file)] ?? "other",
    bytes   : size,
  };
};

const unit = async (name: string, files: readonly string[]): Promise<Unit> => ({
  id       : `root:${name}`,
  projectId: "root",
  kind     : "directory",
  name,
  path     : name,
  facts    : {
    base: {
      files       : await Promise.all(files.map(fact)),
      testFiles   : [],
      ignoredFiles: [],
      languages   : [{ language: "typescript", count: files.length }],
      roleHint    : null,
    },
    producedBy: ["generic"],
  },
  hash: `hash-${name}`,
});

const context = async (): Promise<EnrichContext> => {
  const project = { id: "root", name: "fixture", rootDir: "." };

  return {
    root     : ROOT,
    config   : GlossicConfigSchema.parse({}),
    project,
    workspace: {
      name      : "fixture",
      root      : ROOT,
      isMonorepo: false,
      tool      : "none",
      projects  : [project],
    },
    units: [
      await unit("src/core", [
        "src/core/index.ts",
        "src/core/service.ts",
        "src/core/strings.ts",
        "src/core/types.ts",
      ]),
      await unit("src/ui", ["src/ui/Button.tsx", "src/ui/legacy.js"]),
    ],
  };
};

const discoverContext = (root: string): DiscoverContext => {
  const project = { id: "root", name: "fixture", rootDir: "." };

  return {
    root,
    config   : GlossicConfigSchema.parse({}),
    project,
    workspace: { name: "fixture", root, isMonorepo: false, tool: "none", projects: [project] },
  };
};

afterAll(disposeGrammars);

describe("treesitter adapter", () => {
  it('is named "treesitter"', () => {
    expect(treesitterAdapter.name).toBe(treesitterAdapterName);
  });

  it("claims a project that carries a package or tsconfig manifest", async () => {
    await expect(treesitterAdapter.detect(discoverContext(ROOT))).resolves.toBe(true);
  });

  it("claims no project without one", async () => {
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-treesitter-"));

    try {
      await expect(treesitterAdapter.detect(discoverContext(empty))).resolves.toBe(false);
    } finally {
      await fs.rm(empty, { force: true, recursive: true });
    }
  });
});

describe("enrich", () => {
  it("keys the facts by unit id and touches no other unit", async () => {
    const { facts } = await treesitterAdapter.enrich(await context());

    expect(Object.keys(facts).sort()).toEqual(["root:src/core", "root:src/ui"]);
  });

  it("reports the exported surface of a unit, files pooled", async () => {
    const { facts } = await treesitterAdapter.enrich(await context());
    const names     = facts["root:src/core"]?.symbols?.symbols.map((one) => one.name) ?? [];

    expect(names).toContain("OrderService");
    expect(names).toContain("slugify");
    expect(names).toContain("Order");
    expect(names).toContain("OrderService.find");
  });

  it("names the file each symbol came from, relative to the workspace root", async () => {
    const { facts } = await treesitterAdapter.enrich(await context());
    const symbols   = facts["root:src/core"]?.symbols?.symbols ?? [];

    expect(symbols.every((one) => one.file.startsWith("src/core/"))).toBe(true);
  });

  it("adds no framework block, which is not its to state", async () => {
    const { facts } = await treesitterAdapter.enrich(await context());

    expect(facts["root:src/core"]?.framework).toBeUndefined();
  });

  it("draws an edge for an import that crosses from one unit to another", async () => {
    const { relations } = await treesitterAdapter.enrich(await context());

    expect(relations).toEqual([
      { from: "root:src/ui", to: "root:src/core", kind: "imports", weight: 2 },
    ]);
  });

  it("draws no edge for an import that stays inside its own unit", async () => {
    const { relations } = await treesitterAdapter.enrich(await context());

    expect(relations.some((one) => one.from === one.to)).toBe(false);
  });

  it("produces the same result twice over unchanged files", async () => {
    const first  = await treesitterAdapter.enrich(await context());
    const second = await treesitterAdapter.enrich(await context());

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("leaves a file bigger than the parse ceiling unread", async () => {
    const base = await context();
    const core = base.units[0];

    if (core === undefined) throw new Error("fixture is missing its first unit");

    const oversized: Unit = {
      ...core,
      facts: {
        ...core.facts,
        base: {
          ...core.facts.base,
          files: core.facts.base.files.map((one) => ({ ...one, bytes: MAX_PARSE_BYTES + 1 })),
        },
      },
    };

    const { facts } = await treesitterAdapter.enrich({ ...base, units: [oversized] });

    expect(facts).toEqual({});
  });

  it("says nothing about a unit whose files it cannot read", async () => {
    const base = await context();
    const only = base.units[1];

    if (only === undefined) throw new Error("fixture is missing its second unit");

    const noSource: Unit = {
      ...only,
      id   : "root:src/other",
      facts: {
        ...only.facts,
        base: {
          ...only.facts.base,
          files: [{ path: "src/other/data.py", language: "python", bytes: 10 }],
        },
      },
    };

    const { facts } = await treesitterAdapter.enrich({ ...base, units: [noSource] });

    expect(facts).toEqual({});
  });
});
