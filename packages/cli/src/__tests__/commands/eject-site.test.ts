import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildManifest, serializeManifest } from "@glossic/core";
import type { Unit, Workspace } from "@glossic/schema";
import { afterAll, describe, expect, it } from "vitest";

import {
  accentPalette,
  buildSidebar,
  customCss,
  DEFAULT_ACCENT,
  extractHeading,
  isGroup,
  normaliseHex,
  pathTitle,
  runEject,
  sidebarEntries,
  sidebarLabel,
  templateFiles,
  titleCase,
  toStarlightPage,
} from "../../commands/eject/index.js";
import type { SidebarNode } from "../../commands/eject/sidebar.js";

const tempDirs: string[] = [];

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

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

const workspace = (): Workspace =>
  ({
    name          : "riqsi",
    root          : "/riqsi",
    isMonorepo    : false,
    tool          : "none",
    packageManager: "pnpm",
    projects      : [{ id: "root", name: "riqsi", rootDir: "." }],
  }) as unknown as Workspace;

/** A single-project workspace shaped like a real API. */
const apiManifest = (paths: readonly string[]) =>
  buildManifest(
    workspace(),
    [{ units: paths.map((p) => unit("root", p, p)), relations: [] }],
    { generatedAt: "2026-01-01T00:00:00.000Z" },
  );

const labelledSidebar = (paths: readonly string[]): SidebarNode[] => {
  const manifest = apiManifest(paths);
  const labels   = new Map(
    manifest.units.map((u) => [u.id, titleCase(u.path.split("/").at(-1) ?? u.path)]),
  );

  return buildSidebar(manifest, labels);
};

describe("the title a page carries", () => {
  const withHeading = [
    "---",
    'title: "src/modules/taxpayer-registry"',
    'hash: "abc"',
    "---",
    "",
    "# Taxpayer Registry",
    "",
    "Lookups against the tax authority, with a cache in front.",
  ].join("\n");

  it("comes from the document's own H1, which reads better than the path", () => {
    expect(toStarlightPage(withHeading, "fallback").title).toBe("Taxpayer Registry");
  });

  it("falls back to what the caller hands over, not to the path in the frontmatter", () => {
    const noHeading = ["---", 'title: "src/modules/taxpayer-registry"', "---", "", "Just prose."].join("\n");

    // glossic writes the unit path into `title`; letting it through would put a
    // raw path on the page and, being under the limit, in the sidebar too.
    expect(toStarlightPage(noHeading, "Taxpayer Registry").title).toBe("Taxpayer Registry");
  });

  it("falls back the same way when there is no frontmatter at all", () => {
    expect(toStarlightPage("Just prose.", "Shared").title).toBe("Shared");
  });

  it("turns a unit path into a heading a person would write", () => {
    expect(pathTitle("src/modules/taxpayer-registry")).toBe("Taxpayer Registry");
    expect(pathTitle("src/modules/api-keys")).toBe("API Keys");
    expect(pathTitle("scripts")).toBe("Scripts");
  });

  it("shows the same words on the page and in the sidebar when there is no H1", () => {
    const noHeading = ["---", 'title: "src/modules/taxpayer-registry"', "---", "", "Just prose."].join("\n");
    const unitPath  = "src/modules/taxpayer-registry";

    const page = toStarlightPage(noHeading, pathTitle(unitPath));

    expect(page.title).toBe("Taxpayer Registry");
    expect(sidebarLabel(page.title, unitPath)).toBe(page.title);
    expect(page.title).not.toContain("/");
  });

  it("strips the markdown a heading may carry", () => {
    expect(extractHeading("# `src` cache and **lookups**")).toBe("src cache and lookups");
    expect(extractHeading("no heading here")).toBeUndefined();
  });
});

describe("the label the sidebar shows", () => {
  it("turns a directory name into words, keeping known acronyms", () => {
    expect(titleCase("taxpayer-registry")).toBe("Taxpayer Registry");
    expect(titleCase("api-keys")).toBe("API Keys");
    expect(titleCase("dto")).toBe("DTO");
  });

  it("uses the heading while it is short enough to read in a column", () => {
    expect(sidebarLabel("Taxpayer Registry", "src/modules/taxpayer-registry")).toBe(
      "Taxpayer Registry",
    );
  });

  it("shortens a long heading to the directory name", () => {
    const long = "The taxpayer registry, its lookups and the cache that fronts the tax authority";

    expect(long.length).toBeGreaterThan(60);
    expect(sidebarLabel(long, "src/modules/taxpayer-registry")).toBe("Taxpayer Registry");
  });

  it("never shows a raw path when it has to fall back", () => {
    const label = sidebarLabel(undefined, "src/modules/taxpayer-registry");

    expect(label).toBe("Taxpayer Registry");
    expect(label).not.toContain("/");
  });
});

describe("the sidebar hierarchy", () => {
  const paths = [
    "scripts",
    "src",
    "src/database",
    "src/modules/auth",
    "src/modules/users",
    "src/shared",
  ];

  it("groups the pages that share a directory, and names it after that directory", () => {
    const modules = labelledSidebar(paths).find((node) => node.label === "Modules");

    expect(modules).toBeDefined();
    expect(sidebarEntries([modules as SidebarNode]).map((entry) => entry.slug)).toEqual([
      "src/modules/auth",
      "src/modules/users",
    ]);
  });

  it("puts a directory's own page at the head of its group, not beside it", () => {
    const group = labelledSidebar(paths).find((node) => node.label === "Src" && isGroup(node));

    // src has a page of its own and two children, so there is one "Src" in the
    // sidebar rather than a page and a folder sharing the name.
    expect(sidebarEntries([group as SidebarNode]).map((entry) => entry.slug)).toEqual([
      "src",
      "src/database",
      "src/shared",
    ]);
  });

  it("does not nest a directory that holds a single page", () => {
    const bars = labelledSidebar(["src/only", "scripts"]);

    expect(bars.every((node) => !isGroup(node))).toBe(true);
    expect(bars.map((node) => node.label).sort()).toEqual(["Only", "Scripts"]);
  });

  it("leaves the pages at the project root at the top level", () => {
    const top = labelledSidebar(paths)
      .filter((node) => !isGroup(node))
      .map((node) => node.label);

    expect(top).toEqual(["Scripts"]);
  });

  it("skips the project level when the workspace has one project", () => {
    expect(labelledSidebar(paths).some((node) => node.label === "riqsi")).toBe(false);
  });
});

describe("branding", () => {
  it("defaults to an accent that is not Starlight's purple", () => {
    expect(DEFAULT_ACCENT).toBe("#0d9488");
  });

  it("accepts the shapes a person types a colour in", () => {
    expect(normaliseHex("#0d9488")).toBe("#0d9488");
    expect(normaliseHex("0D9488")).toBe("#0d9488");
    expect(normaliseHex("#abc")).toBe("#aabbcc");
    expect(normaliseHex("teal")).toBeUndefined();
  });

  it("derives a quiet and a loud shade from the one colour", () => {
    const palette = accentPalette("#0d9488");

    expect(palette.dark.base).toBe("#0d9488");
    expect(palette.dark.low).not.toBe(palette.dark.high);
    expect(palette.light.low).not.toBe(palette.light.high);
  });

  it("writes the accent into the stylesheet, for both themes", () => {
    const css = customCss("#ff5500");

    expect(css).toContain("#ff5500");
    expect(css).toContain('data-theme="light"');
  });

  it("puts the stylesheet and the tagline in the config", () => {
    const files = templateFiles({
      lang: "en", stats: { projects: 1, units: 3, files: 9, languages: [{ language: "typescript", count: 9 }], generatedAt: "2026-01-01T00:00:00.000Z" }, 
      title      : "Riqsi",
      description: "The tax API",
      accent     : "#ff5500",
      sidebar    : [],
    });

    expect(files["astro.config.mjs"]).toContain('customCss: ["./src/styles/custom.css"]');
    expect(files["astro.config.mjs"]).toContain('description: "The tax API"');
    expect(files["src/styles/custom.css"]).toContain("#ff5500");
  });

  it("refuses a colour it cannot parse", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-accent-"));
    tempDirs.push(root);

    const manifest = apiManifest(["src"]);

    await fs.mkdir(path.join(root, ".glossic"), { recursive: true });
    await fs.writeFile(path.join(root, ".glossic", "manifest.json"), serializeManifest(manifest), "utf8");
    await fs.mkdir(path.join(root, "docs"), { recursive: true });
    await fs.writeFile(path.join(root, "docs", "src.md"), "---\ntitle: \"src\"\n---\n\n# Src\n\nProse.\n", "utf8");

    await expect(runEject(root, { uiLang: "en", accent: "not-a-colour" })).rejects.toThrow(
      /not a hex colour/,
    );

    const result = await runEject(root, { uiLang: "en", accent: "#ff5500" });
    const css    = await fs.readFile(path.join(result.outDir, "src/styles/custom.css"), "utf8");

    expect(result.accent).toBe("#ff5500");
    expect(css).toContain("#ff5500");
  });
});

describe("the landing page", () => {
  it("uses the splash template and the site title", () => {
    const page = templateFiles({ lang: "en", stats: { projects: 1, units: 3, files: 9, languages: [{ language: "typescript", count: 9 }], generatedAt: "2026-01-01T00:00:00.000Z" }, title: "Riqsi", accent: DEFAULT_ACCENT, sidebar: [] })[
      "src/content/docs/index.mdx"
    ];

    expect(page).toContain("template: splash");
    expect(page).toContain('title: "Riqsi"');
  });

  it("carries the description through as the tagline", () => {
    const page = templateFiles({
      lang: "en", stats: { projects: 1, units: 3, files: 9, languages: [{ language: "typescript", count: 9 }], generatedAt: "2026-01-01T00:00:00.000Z" }, 
      title      : "Riqsi",
      description: "The tax API",
      accent     : DEFAULT_ACCENT,
      sidebar    : [],
    })["src/content/docs/index.mdx"];

    expect(page).toContain('tagline: "The tax API"');
  });

  it("links to the first page of each top-level section", () => {
    const page = templateFiles({
      lang: "en", stats: { projects: 1, units: 3, files: 9, languages: [{ language: "typescript", count: 9 }], generatedAt: "2026-01-01T00:00:00.000Z" }, 
      title  : "Riqsi",
      accent : DEFAULT_ACCENT,
      sidebar: [
        { label: "Overview", slug: "src" },
        { label: "Modules", items: [{ label: "Auth", slug: "src/modules/auth" }] },
      ],
    })["src/content/docs/index.mdx"];

    expect(page).toContain('link: "/src/"');
    expect(page).toContain('link: "/src/modules/auth/"');
  });
});
