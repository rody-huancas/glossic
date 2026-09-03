import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildManifest, serializeManifest, unitDocPath } from "@glossic/core";
import { SPLIT_SEPARATOR } from "@glossic/adapter-generic";
import type { Manifest, Unit } from "@glossic/schema";
import { afterAll, describe, expect, it } from "vitest";

import { runEject, slugFor } from "../../commands/eject/index.js";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/**
 * Astro's own slugification, written from Astro's side rather than from ours:
 * it splits a content entry's id on the path separator and runs each segment
 * through github-slugger, whose character class is what is reproduced here.
 *
 * Every slug the sidebar carries has to be a fixed point of this function, or
 * Starlight refuses the build with "The slug does not exist".
 */
const astroSlug = (fileName: string): string =>
  fileName
    .replace(/\.md$/, "")
    .split("/")
    .map((segment) =>
      segment
        .toLowerCase()
        .replace(/['!"#$%&()*+,./:;<=>?@[\]^`{|}~\u2000-\u206f\u2e00-\u2e7f]/g, "")
        .replace(/ /g, "-"),
    )
    .join("/")
    .replace(/\/index$/, "");

const unit = (projectId: string, name: string, unitPath: string): Unit =>
  ({
    id       : `${projectId}:${name}`,
    projectId,
    kind     : "directory",
    name,
    path     : unitPath,
    hash     : "h".repeat(8),
    facts: {
      base: {
        files       : [{ path: `${unitPath}/a.ts`, language: "typescript", bytes: 10 }],
        testFiles   : [],
        ignoredFiles: [],
        languages   : [{ language: "typescript", count: 1 }],
        roleHint    : null,
      },
      producedBy: ["generic"],
    },
  }) as unknown as Unit;

/** `dto` was too big for one page, so the adapter split it and named the halves. */
const split = (label: string): string => `src/dto${SPLIT_SEPARATOR}${label}`;

const UNITS = [
  split("assign-course"),
  split("create-user"),
  "src/Controllers",
  "src/never-generated",
];

const manifest = (): Manifest =>
  buildManifest(
    {
      name          : "riqsi",
      root          : "/riqsi",
      isMonorepo    : false,
      tool          : "pnpm",
      packageManager: "pnpm",
      projects      : [{ id: "root", name: "riqsi", rootDir: "." }],
    },
    [{ units: UNITS.map((name) => unit("root", name, name)), relations: [] }],
    { generatedAt: "2026-01-01T00:00:00.000Z" },
  );

/**
 * A workspace whose pages are on disk under the names `generate` writes them
 * with -- the unit path verbatim, separator included -- with one unit left
 * without a page, the way a unit whose completion failed is left.
 */
const fixture = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-slugs-"));
  tempDirs.push(root);

  const m = manifest();

  await fs.mkdir(path.join(root, ".glossic"), { recursive: true });
  await fs.writeFile(path.join(root, ".glossic", "manifest.json"), serializeManifest(m), "utf8");

  for (const entry of m.units) {
    if (entry.name === "src/never-generated") continue;

    const file = path.join(root, "docs", unitDocPath(entry));

    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(
      file,
      ["---", `title: ${JSON.stringify(entry.name)}`, "---", "", `What ${entry.name} does.`, ""].join("\n"),
      "utf8",
    );
  }

  return { root, manifest: m };
};

/** Every slug the generated Starlight config points the reader at. */
const configuredSlugs = async (outDir: string): Promise<string[]> => {
  const config = await fs.readFile(path.join(outDir, "astro.config.mjs"), "utf8");

  return [...config.matchAll(/slug: "([^"]+)"/g)].map((match) => match[1] ?? "");
};

describe("the slug of a split unit", () => {
  it("survives the separator instead of losing it", () => {
    const slug = slugFor(unit("root", split("assign-course"), split("assign-course")));

    // `~` is punctuation Astro drops, so the separator has to become something
    // that is not: without this the two halves of `dto` collapse onto one slug.
    expect(slug).toBe("src/dto--assign-course");
    expect(slug).not.toContain(SPLIT_SEPARATOR);
  });

  it("is what Astro would derive from the same name, so slugifying it again changes nothing", () => {
    for (const name of UNITS) {
      expect(astroSlug(`${slugFor(unit("root", name, name))}.md`)).toBe(slugFor(unit("root", name, name)));
    }
  });
});

describe("what eject writes", () => {
  it("names every page after the slug the sidebar uses", async () => {
    const { root }   = await fixture();
    const result     = await runEject(root, { uiLang: "en" });
    const contentDir = path.join(result.outDir, "src/content/docs");

    const slugs = await configuredSlugs(result.outDir);
    expect(slugs).toContain("src/dto--assign-course");

    for (const slug of slugs) {
      const page = path.join(contentDir, `${slug}.md`);

      await expect(fs.readFile(page, "utf8"), slug).resolves.toBeTruthy();
      expect(astroSlug(`${slug}.md`), slug).toBe(slug);
    }
  });

  it("leaves the unit with no page out of the sidebar and says how many it left out", async () => {
    const { root } = await fixture();
    const result   = await runEject(root, { uiLang: "en" });

    expect(await configuredSlugs(result.outDir)).not.toContain("src/never-generated");
    expect(result.skipped).toEqual(["root:src/never-generated"]);
  });

  it("lists the undocumented unit on the structure page without linking it", async () => {
    const { root } = await fixture();
    const result   = await runEject(root, { uiLang: "en" });

    const page = await fs.readFile(
      path.join(result.outDir, "src/content/docs/structure.md"),
      "utf8",
    );

    expect(page).toContain("| src/never-generated |");
    expect(page).toContain("[src/dto~~assign-course](/src/dto--assign-course/)");
    expect(page).not.toContain("(/src/never-generated/)");
  });
});
