import { buildManifest } from "@glossic/core";
import type { Manifest, Unit, Workspace } from "@glossic/schema";
import { describe, expect, it } from "vitest";

import {
  buildSidebar,
  looksLikePath,
  pathTitle,
  sidebarEntries,
  sidebarLabel,
  siteStats,
  siteStrings,
  startSlug,
  STRUCTURE_SLUG,
  structurePage,
  templateFiles,
  toStarlightPage,
} from "../../commands/eject/index.js";

const unit = (projectId: string, unitPath: string, files: number, language = "typescript"): Unit =>
  ({
    id       : `${projectId}:${unitPath}`,
    projectId,
    kind     : "directory",
    name     : unitPath,
    path     : unitPath,
    hash     : "h".repeat(8),
    facts: {
      base: {
        files: Array.from({ length: files }, (_, i) => ({
          path    : `${unitPath}/f${i}.ts`,
          language,
          bytes   : 10,
        })),
        testFiles   : [],
        ignoredFiles: [],
        languages   : [{ language, count: files }],
        roleHint    : null,
      },
      producedBy: ["generic"],
    },
  }) as unknown as Unit;

const manifest = (): Manifest =>
  buildManifest(
    {
      name          : "riqsi",
      root          : "/riqsi",
      isMonorepo    : false,
      tool          : "none",
      packageManager: "pnpm",
      projects      : [{ id: "root", name: "riqsi", rootDir: "." }],
    } as unknown as Workspace,
    [
      {
        units: [
          unit("root", "src", 2),
          unit("root", "src/modules/auth", 16),
          unit("root", "src/modules/users", 8),
          unit("root", "src/shared", 23, "tsx"),
        ],
        relations: [],
      },
    ],
    { generatedAt: "2026-02-14T09:30:00.000Z" },
  );

const siteFor = (lang: string) => {
  const m      = manifest();
  const labels = new Map(m.units.map((u) => [u.id, pathTitle(u.path)]));

  const sidebar = [
    { label: siteStrings(lang).structure, slug: STRUCTURE_SLUG },
    ...buildSidebar(m, labels),
  ];

  return { manifest: m, sidebar, files: templateFiles({
    title  : "Riqsi",
    accent : "#0d9488",
    lang,
    stats  : siteStats(m),
    sidebar,
  }) };
};

describe("a raw path never reaches the sidebar", () => {
  it("discards a heading that is only the unit's path", () => {
    const source = ["---", 'title: "src/modules/auth"', "---", "", "# src/modules/auth", "", "Prose."].join("\n");

    // The model is shown the path and often answers with it as the heading.
    const page = toStarlightPage(source, pathTitle("src/modules/auth"), "src/modules/auth");

    expect(page.title).toBe("Auth");
    expect(sidebarLabel(page.title, "src/modules/auth")).toBe("Auth");
  });

  it("discards a single-segment path heading too", () => {
    const source = ["---", 'title: "scripts"', "---", "", "# scripts", "", "Prose."].join("\n");

    expect(toStarlightPage(source, pathTitle("scripts"), "scripts").title).toBe("Scripts");
  });

  it("keeps a heading that only happens to contain a slash", () => {
    const source = ["---", 'title: "src"', "---", "", "# @example/api — the server", "", "Prose."].join("\n");

    expect(toStarlightPage(source, "Src", "src").title).toBe("@example/api — the server");
  });

  it("recognises a path with or without being told which one", () => {
    expect(looksLikePath("src/modules/auth")).toBe(true);
    expect(looksLikePath("scripts", "scripts")).toBe(true);
    expect(looksLikePath("Auth")).toBe(false);
    expect(looksLikePath("@example/api — the server")).toBe(false);
  });

  it("leaves no entry looking like a path across the whole sidebar", () => {
    const { sidebar } = siteFor("en");

    for (const entry of sidebarEntries(sidebar)) {
      expect(looksLikePath(entry.label)).toBe(false);
      expect(entry.label).not.toContain("/");
    }
  });
});

describe("the landing page", () => {
  it("puts Get started in the documentation's language", () => {
    expect(siteFor("en").files["src/content/docs/index.mdx"]).toContain('text: "Get started"');
    expect(siteFor("es").files["src/content/docs/index.mdx"]).toContain('text: "Empezar"');
    expect(siteFor("pt").files["src/content/docs/index.mdx"]).toContain('text: "Começar"');
  });

  it("falls back to English for a language it has no words for", () => {
    expect(siteFor("ja").files["src/content/docs/index.mdx"]).toContain('text: "Get started"');
  });

  it("points Get started at the first real page, not at the structure", () => {
    const page = siteFor("en").files["src/content/docs/index.mdx"] ?? "";
    const at   = page.indexOf('text: "Get started"');

    expect(page.slice(at, at + 120)).toContain('link: "/src/"');
  });

  it("introduces the project with what the manifest counted", () => {
    const page = siteFor("en").files["src/content/docs/index.mdx"] ?? "";

    expect(page).toContain("**4** modules");
    expect(page).toContain("**49** files");
    expect(page).toContain("typescript 26, tsx 23");
    expect(page).toContain("generated: 2026-02-14");
  });

  it("writes that introduction in the documentation's language too", () => {
    const page = siteFor("es").files["src/content/docs/index.mdx"] ?? "";

    expect(page).toContain("De un vistazo");
    expect(page).toContain("módulos");
    expect(page).toContain("generado: 2026-02-14");
  });
});

describe("the structure page", () => {
  it("lists every unit the manifest has, with its files and language", () => {
    const page = structurePage(manifest(), "en");

    expect(page).toContain("| [src](/src/) | 2 | typescript |");
    expect(page).toContain("| [src/modules/auth](/src/modules/auth/) | 16 | typescript |");
    expect(page).toContain("| [src/shared](/src/shared/) | 23 | tsx |");
  });

  it("links each row to the page for that unit", () => {
    expect(structurePage(manifest(), "en")).toContain("[src/modules/auth](/src/modules/auth/)");
  });

  it("keeps the manifest's order", () => {
    const rows = structurePage(manifest(), "en")
      .split("\n")
      .filter((line) => line.startsWith("| ["))
      .map((line) => line.slice(3, line.indexOf("]")));

    expect(rows).toEqual(["src", "src/modules/auth", "src/modules/users", "src/shared"]);
  });

  it("is titled and headed in the documentation's language", () => {
    expect(structurePage(manifest(), "es")).toContain('title: "Estructura del proyecto"');
    expect(structurePage(manifest(), "es")).toContain("| Directorio | Archivos | Lenguaje |");
  });

  it("is the first entry of the sidebar, before any group", () => {
    const { sidebar } = siteFor("en");

    expect(sidebar[0]?.label).toBe("Project structure");
    expect(sidebar[0]).toMatchObject({ slug: STRUCTURE_SLUG });
  });
});

describe("what the manifest adds up to", () => {
  it("counts projects, units, files and languages", () => {
    const stats = siteStats(manifest());

    expect(stats).toMatchObject({ projects: 1, units: 4, files: 49 });
    expect(stats.languages).toEqual([
      { language: "typescript", count: 26 },
      { language: "tsx", count: 23 },
    ]);
  });
});

describe("where Get started lands", () => {
  /** A manifest built from paths and file counts alone. */
  const shaped = (units: ReadonlyArray<[string, number]>): Manifest =>
    buildManifest(
      {
        name          : "demo",
        root          : "/demo",
        isMonorepo    : false,
        tool          : "none",
        packageManager: "pnpm",
        projects      : [{ id: "root", name: "demo", rootDir: "." }],
      } as unknown as Workspace,
      [{ units: units.map(([p, n]) => unit("root", p, n)), relations: [] }],
      { generatedAt: "2026-02-14T09:30:00.000Z" },
    );

  it("picks the code root over whatever the manifest sorted first", () => {
    // riqsi-api's shape: `scripts` sorts first but holds the build tooling.
    const manifest = shaped([["scripts", 2], ["src", 6], ["src/modules/auth", 16]]);

    expect(startSlug(manifest)).toBe("src");
  });

  it("recognises lib and app as code roots too", () => {
    expect(startSlug(shaped([["scripts", 9], ["lib", 2]]))).toBe("lib");
    expect(startSlug(shaped([["scripts", 9], ["app", 2]]))).toBe("app");
  });

  it("prefers the shallowest code root when a nested one shares the name", () => {
    const manifest = shaped([["packages/web/src", 3], ["src", 1]]);

    expect(startSlug(manifest)).toBe("src");
  });

  it("falls back to the unit with the most files when no root is recognisable", () => {
    const manifest = shaped([["scripts", 2], ["domain/orders", 12], ["infra", 5]]);

    expect(startSlug(manifest)).toBe("domain/orders");
  });

  it("keeps manifest order when two units tie on file count", () => {
    const manifest = shaped([["alpha", 4], ["beta", 4]]);

    expect(startSlug(manifest)).toBe("alpha");
  });

  it("only lands on a unit that actually has a page", () => {
    const manifest = shaped([["scripts", 2], ["src", 6]]);

    // src was never generated, so Get started cannot point at it.
    expect(startSlug(manifest, new Set(["root:scripts"]))).toBe("scripts");
  });

  it("has nothing to point at when nothing is documented", () => {
    expect(startSlug(shaped([["src", 1]]), new Set())).toBeUndefined();
  });

  it("is what the landing page links its primary button to", () => {
    const manifest = shaped([["scripts", 2], ["src", 6]]);
    const labels   = new Map(manifest.units.map((u) => [u.id, pathTitle(u.path)]));

    const files = templateFiles({
      title    : "Demo",
      accent   : "#0d9488",
      lang     : "en",
      stats    : siteStats(manifest),
      startSlug: startSlug(manifest),
      sidebar  : buildSidebar(manifest, labels),
    });

    const page = files["src/content/docs/index.mdx"] ?? "";
    const at   = page.indexOf('text: "Get started"');

    expect(page.slice(at, at + 120)).toContain('link: "/src/"');
  });
});
