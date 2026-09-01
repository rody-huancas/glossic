import { GlossicConfigSchema } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import type { GroupingOptions, UnitDraft } from "../grouping.js";
import {
  filenameRoot,
  isReadableLabel,
  SPLIT_SEPARATOR,
  shapeUnits,
  splitLargeUnit,
  unitName,
} from "../grouping.js";

const defaults = (overrides: Partial<GroupingOptions> = {}): GroupingOptions => {
  const config = GlossicConfigSchema.parse({});
  return {
    ignoreUnits: config.ignoreUnits,
    excludeFromContent: config.excludeFromContent,
    mergeChildrenInto: config.mergeChildrenInto,
    minUnitFiles: config.minUnitFiles,
    maxUnitFiles: config.maxUnitFiles,
    ...overrides,
  };
};

const shape = (files: readonly string[], overrides: Partial<GroupingOptions> = {}) =>
  shapeUnits(files, defaults(overrides));

/** Subtree merging off, so a test can isolate one of the other rules. */
const shapeWithoutSubtreeMerge = (
  files: readonly string[],
  overrides: Partial<GroupingOptions> = {},
) => shape(files, { mergeChildrenInto: 1, ...overrides });

const names = (drafts: readonly UnitDraft[]): string[] => drafts.map(unitName);

const numbered = (dir: string, count: number, from = 1): string[] =>
  Array.from(
    { length: count },
    (_, index) => `${dir}/mod-${String(index + from).padStart(2, "0")}.ts`,
  );

describe("units with no documentable content", () => {
  it("drops a unit that is only build configuration", () => {
    const drafts = shape(["tsup.config.ts", "vitest.config.ts"]);
    expect(drafts).toEqual([]);
  });

  it("drops the build config at the project root and keeps the source", () => {
    const drafts = shape([
      "tsup.config.ts",
      "vitest.config.ts",
      "src/index.ts",
      "src/other.ts",
      "src/thing.ts",
    ]);

    expect(names(drafts)).toEqual(["src"]);
    expect(drafts[0]?.files).toEqual(["src/index.ts", "src/other.ts", "src/thing.ts"]);
  });

  it("keeps a nested config module: it is application code, not build setup", () => {
    const drafts = shapeWithoutSubtreeMerge([
      "src/index.ts",
      "src/other.ts",
      "src/thing.ts",
      "src/config/app.config.ts",
    ]);

    expect(names(drafts)).toEqual(["src", "src/config"]);
    expect(drafts[1]?.files).toEqual(["src/config/app.config.ts"]);
  });

  it("drops a directory that only holds tests", () => {
    const drafts = shape(["src/a.ts", "src/b.ts", "src/c.ts", "test/e2e.spec.ts"]);

    expect(names(drafts)).toEqual(["src"]);
  });

  it("honours a custom ignoreUnits", () => {
    const drafts = shape(["src/a.ts", "src/generated.ts", "src/b.ts", "src/c.ts"], {
      ignoreUnits: ["**/generated.ts"],
    });

    expect(drafts[0]?.files).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });
});

describe("tests count for the hash but not for the content", () => {
  it("moves a __tests__ directory into the unit above it", () => {
    const drafts = shape(["src/a.ts", "src/b.ts", "src/c.ts", "src/__tests__/helper.ts"]);

    expect(names(drafts)).toEqual(["src"]);
    expect(drafts[0]?.files).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(drafts[0]?.testFiles).toEqual(["src/__tests__/helper.ts"]);
  });

  it("drops a test-only directory with nothing above it to attach to", () => {
    expect(shape(["test/e2e.spec.ts"])).toEqual([]);
  });

  it("separates test files from documentable files", () => {
    const drafts = shape(["src/a.ts", "src/a.test.ts", "src/b.ts", "src/b.spec.ts", "src/c.ts"]);

    expect(names(drafts)).toEqual(["src"]);
    expect(drafts[0]?.files).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(drafts[0]?.testFiles).toEqual(["src/a.test.ts", "src/b.spec.ts"]);
  });

  it("honours a custom excludeFromContent", () => {
    const drafts = shape(["src/a.ts", "src/b.ts", "src/c.ts", "src/a.bench.ts"], {
      excludeFromContent: ["**/*.bench.*"],
    });

    expect(drafts[0]?.files).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
    expect(drafts[0]?.testFiles).toEqual(["src/a.bench.ts"]);
  });
});

describe("merging thin parents", () => {
  it("collapses a package root and its src into one unit", () => {
    const drafts = shapeWithoutSubtreeMerge(["index.ts", "src/server.ts", "src/routes.ts"]);

    expect(names(drafts)).toEqual(["root"]);
    expect(drafts[0]?.files).toEqual(["index.ts", "src/routes.ts", "src/server.ts"]);
  });

  it("collapses a thin src into its children until it reaches the floor", () => {
    const drafts = shapeWithoutSubtreeMerge([
      "src/index.ts",
      "src/routes/orders.ts",
      "src/routes/users.ts",
      "src/services/orders.ts",
    ]);

    expect(names(drafts)).toEqual(["src", "src/services"]);
    expect(drafts[0]?.files).toHaveLength(3);
  });

  it("stops absorbing once the parent reaches the floor", () => {
    const drafts = shapeWithoutSubtreeMerge([
      "src/a.ts",
      "src/b.ts",
      "src/small/one.ts",
      "src/big/x.ts",
      "src/big/y.ts",
      "src/big/z.ts",
      "src/big/w.ts",
    ]);

    // "src/big" sorts before "src/small", so it is absorbed first and lifts
    // the parent to the floor; "src/small" survives on its own.
    expect(names(drafts)).toEqual(["src", "src/small"]);
    expect(drafts[0]?.files).toHaveLength(6);
  });

  it("leaves a parent alone once it has enough of its own files", () => {
    const drafts = shapeWithoutSubtreeMerge(["src/a.ts", "src/b.ts", "src/c.ts", "src/deep/d.ts"]);

    expect(names(drafts)).toEqual(["src", "src/deep"]);
  });

  it("honours a custom minUnitFiles", () => {
    const files = ["src/a.ts", "src/b.ts", "src/c.ts", "src/deep/d.ts"];

    expect(names(shapeWithoutSubtreeMerge(files, { minUnitFiles: 1 }))).toEqual([
      "src",
      "src/deep",
    ]);
    expect(names(shapeWithoutSubtreeMerge(files, { minUnitFiles: 5 }))).toEqual(["src"]);
  });
});

describe("splitting large units", () => {
  it("splits a directory that is over the ceiling", () => {
    const drafts = shape(numbered("src", 26));

    expect(drafts.length).toBeGreaterThan(1);
    for (const draft of drafts) expect(draft.files.length).toBeLessThanOrEqual(10);
    expect(drafts.flatMap((draft) => draft.files)).toHaveLength(26);
  });

  it("names each slice after its first filename root", () => {
    const drafts = shape([...numbered("src", 12)]);

    expect(names(drafts)).toEqual(["src~~mod-01", "src~~mod-11"]);
  });

  it("keeps a module and its test together in the same slice", () => {
    const files = [...numbered("src", 11), "src/mod-01.test.ts", "src/mod-01.types.ts"];
    const drafts = shape(files, { excludeFromContent: ["**/*.test.*"] });

    const owner = drafts.find((draft) => draft.files.includes("src/mod-01.ts"));
    expect(owner?.files).toContain("src/mod-01.types.ts");
    expect(owner?.testFiles).toContain("src/mod-01.test.ts");
  });

  it("leaves a single oversized group whole rather than cutting a module", () => {
    const files = Array.from({ length: 12 }, (_, index) => `src/thing.part${index}.ts`);
    const [draft] = splitLargeUnit({ dir: "src", files, testFiles: [], ignoredFiles: [] }, 10);

    expect(draft?.files).toHaveLength(12);
    expect(draft?.group).toBeUndefined();
  });

  it("honours a custom maxUnitFiles", () => {
    expect(shape(numbered("src", 9), { maxUnitFiles: 3 }).length).toBe(3);
    expect(shape(numbered("src", 9), { maxUnitFiles: 100 }).length).toBe(1);
  });

  it("does not split a unit that sits exactly on the ceiling", () => {
    expect(names(shape(numbered("src", 10)))).toEqual(["src"]);
  });
});

describe("slice labels", () => {
  it("keeps hyphenated filenames out of the label and uses an index", () => {
    // A TypeORM migration directory: every root is a timestamp plus hyphens.
    const migrations = Array.from(
      { length: 12 },
      (_, index) => `src/database/17800539598${String(index).padStart(2, "0")}-create-thing.ts`,
    );
    const drafts = shape(migrations, { ignoreUnits: [] });

    expect(names(drafts)).toEqual(["src/database~~1", "src/database~~2"]);
    for (const draft of drafts) expect(unitName(draft)).not.toContain("create-thing");
  });

  it("keeps a hyphenated but readable root as the label", () => {
    const files = [
      ...Array.from({ length: 11 }, (_, index) => `src/a-mod-${index}.ts`),
      "src/z-last.ts",
    ];
    const drafts = shape(files);

    expect(names(drafts).every((name) => name.startsWith("src~~"))).toBe(true);
    expect(names(drafts)).toContain("src~~a-mod-0");
  });

  it("falls back to indices as soon as one label is unreadable", () => {
    const files = [
      ...Array.from({ length: 6 }, (_, index) => `src/alpha-${index}.ts`),
      ...Array.from({ length: 6 }, (_, index) => `src/1780053959844-create-padron-${index}.ts`),
    ];
    const drafts = shape(files);

    expect(names(drafts)).toEqual(["src~~1", "src~~2"]);
  });

  it("rejects long and generated roots as labels", () => {
    expect(isReadableLabel("generate")).toBe(true);
    expect(isReadableLabel("users-controller")).toBe(true);
    expect(isReadableLabel("1780053959844-create-padron-table")).toBe(false);
    expect(isReadableLabel("2024-01-01-something")).toBe(false);
    expect(isReadableLabel("a".repeat(21))).toBe(false);
    expect(isReadableLabel("a".repeat(20))).toBe(true);
  });

  it("uses a separator that survives paths, urls and markdown", () => {
    expect(SPLIT_SEPARATOR).toBe("~~");
    // None of the Windows-reserved characters, and unreserved in a URL.
    expect(/[<>:"/|?*]/.test(SPLIT_SEPARATOR)).toBe(false);
    expect(encodeURIComponent(SPLIT_SEPARATOR)).toBe(SPLIT_SEPARATOR);
  });
});

describe("merging a subtree into its root", () => {
  const nestModule = (name: string, dtos: number, entities: number, extras: number): string[] => [
    `src/modules/${name}/${name}.module.ts`,
    `src/modules/${name}/${name}.controller.ts`,
    `src/modules/${name}/${name}.service.ts`,
    ...Array.from({ length: dtos }, (_, i) => `src/modules/${name}/dto/dto-${i}.ts`),
    ...Array.from({ length: entities }, (_, i) => `src/modules/${name}/entities/entity-${i}.ts`),
    ...Array.from({ length: extras }, (_, i) => `src/modules/${name}/strategies/strategy-${i}.ts`),
  ];

  it("collapses a module and its dto, entities and strategies into one unit", () => {
    const drafts = shape(nestModule("auth", 7, 1, 3), { mergeChildrenInto: 25 });

    expect(names(drafts)).toEqual(["src/modules/auth"]);
    expect(drafts[0]?.files).toHaveLength(14);
    expect(drafts[0]?.subtreeMerged).toBe(true);
  });

  it("leaves a module alone when its subtree is too large", () => {
    const drafts = shape(nestModule("auth", 7, 1, 3), { mergeChildrenInto: 10 });

    expect(names(drafts)).toEqual([
      "src/modules/auth",
      "src/modules/auth/dto",
      "src/modules/auth/entities",
      "src/modules/auth/strategies",
    ]);
  });

  it("never splits a unit that absorbed a subtree", () => {
    const drafts = shape(nestModule("auth", 7, 1, 3), {
      mergeChildrenInto: 25,
      maxUnitFiles: 5,
    });

    expect(names(drafts)).toEqual(["src/modules/auth"]);
    expect(drafts[0]?.files).toHaveLength(14);
  });

  it("collapses siblings into a parent directory that holds no files itself", () => {
    const drafts = shape(["src/config/cors/cors.ts", "src/config/env/env.ts"]);

    expect(names(drafts)).toEqual(["src/config"]);
    expect(drafts[0]?.files).toEqual(["src/config/cors/cors.ts", "src/config/env/env.ts"]);
  });

  it("does not swallow a directory whose whole subtree is over the threshold", () => {
    const files = [
      ...nestModule("auth", 7, 1, 3),
      ...nestModule("users", 3, 1, 0),
      ...nestModule("plans", 4, 2, 0),
    ];
    const drafts = shape(files, { mergeChildrenInto: 25 });

    expect(names(drafts)).toEqual(["src/modules/auth", "src/modules/plans", "src/modules/users"]);
  });
});

describe("migrations, seeders and generated code", () => {
  const files = [
    "src/database/data-source.ts",
    "src/database/typeorm.config.ts",
    "src/database/migrations/1780053959844-create-padron-table.ts",
    "src/database/migrations/1780253959844-create-users.ts",
    "src/database/seeders/admin.seeder.ts",
    "src/database/__generated__/schema.ts",
    "src/database/client.generated.ts",
  ];

  it("keeps them out of the documentation but inside the hash", () => {
    const drafts = shape(files);

    expect(names(drafts)).toEqual(["src/database"]);
    expect(drafts[0]?.files).toEqual([
      "src/database/data-source.ts",
      "src/database/typeorm.config.ts",
    ]);
    expect(drafts[0]?.ignoredFiles).toEqual([
      "src/database/__generated__/schema.ts",
      "src/database/client.generated.ts",
      "src/database/migrations/1780053959844-create-padron-table.ts",
      "src/database/migrations/1780253959844-create-users.ts",
      "src/database/seeders/admin.seeder.ts",
    ]);
  });

  it("drops them when no unit above them has anything to document", () => {
    expect(shape(["src/database/migrations/0001-init.ts"])).toEqual([]);
  });

  it("keeps a nested *.config.ts, which is application code", () => {
    const drafts = shape(files);
    expect(drafts[0]?.files).toContain("src/database/typeorm.config.ts");
  });
});

describe("filenameRoot", () => {
  it("takes everything before the first dot", () => {
    expect(filenameRoot("src/generate.test.ts")).toBe("generate");
    expect(filenameRoot("src/generate.ts")).toBe("generate");
    expect(filenameRoot("users.controller.spec.ts")).toBe("users");
  });

  it("keeps a dotfile name whole", () => {
    expect(filenameRoot(".gitignore")).toBe(".gitignore");
  });
});

describe("determinism", () => {
  const files = [
    ...numbered("src", 14),
    "src/mod-03.test.ts",
    "src/nested/a.ts",
    "src/nested/b.ts",
    "root.config.ts",
    "index.ts",
  ];

  it("produces the same shape twice", () => {
    expect(shape(files)).toEqual(shape(files));
  });

  it("does not depend on the input order", () => {
    const reversed = [...files].reverse();
    expect(shape(reversed)).toEqual(shape(files));
  });
});
