import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildManifest, serializeManifest } from "@glossic/core";
import type { Manifest, Unit } from "@glossic/schema";
import { afterAll, describe, expect, it } from "vitest";

import {
  buildSidebar,
  DEFAULT_ACCENT,
  isGroup,
  packageName,
  renderSidebar,
  runEject,
  sidebarEntries,
  slugFor,
  summarise,
  templateFiles,
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

const manifest = (): Manifest =>
  buildManifest(
    {
      name          : "demo",
      root          : "/demo",
      isMonorepo    : true,
      tool          : "pnpm",
      packageManager: "pnpm",
      projects: [
        { id: "packages/api", name: "@demo/api", rootDir: "packages/api" },
        { id: "packages/web", name: "@demo/web", rootDir: "packages/web" },
      ],
    },
    [
      {
        units: [
          unit("packages/web", "src", "packages/web/src"),
          unit("packages/api", "src", "packages/api/src"),
          unit("packages/api", "src/routes", "packages/api/src/routes"),
        ],
        relations: [],
      },
    ],
    { generatedAt: "2026-01-01T00:00:00.000Z" },
  );

/**
 * A workspace with a manifest and generated pages, ready to eject from.
 *
 * `docsDir` is where the pages land and `record` whether the manifest admits
 * it, so a test can build both a manifest `generate` wrote and one from before
 * the field existed.
 */
const fixture = async (
  options: { pages?: boolean; manifest?: boolean; docsDir?: string; record?: boolean } = {},
) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-eject-"));
  tempDirs.push(root);

  const docsDir = options.docsDir ?? "docs";
  const m       = options.record === true ? { ...manifest(), docsDir } : manifest();

  if (options.manifest !== false) {
    await fs.mkdir(path.join(root, ".glossic"), { recursive: true });
    await fs.writeFile(path.join(root, ".glossic", "manifest.json"), serializeManifest(m), "utf8");
  }

  if (options.pages !== false) {
    for (const entry of m.units) {
      const file = path.join(root, docsDir, `${entry.path}.md`);

      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(
        file,
        [
          "---",
          `title: ${JSON.stringify(entry.name)}`,
          `unit: ${JSON.stringify(entry.id)}`,
          `hash: ${JSON.stringify(entry.hash)}`,
          "files: 1",
          "---",
          "",
          `# ${entry.name}`,
          "",
          `What ${entry.name} does, in one paragraph.`,
          "",
          "## Detail",
          "",
          "More prose.",
          "",
        ].join("\n"),
        "utf8",
      );
    }
  } else {
    await fs.mkdir(path.join(root, docsDir), { recursive: true });
  }

  return { root, docsDir, manifest: m };
};

/** Every unit documented, labelled by its last path segment. */
const allLabels = (m: ReturnType<typeof manifest>): Map<string, string> =>
  new Map(m.units.map((u) => [u.id, u.name]));

describe("the sidebar comes from the manifest", () => {
  it("groups by project and keeps the manifest's order, not the filesystem's", () => {
    const m    = manifest();
    const bars = buildSidebar(m, allLabels(m));

    expect(bars.map((node) => node.label)).toEqual(["@demo/api", "@demo/web"]);

    // buildManifest sorted the units by id; the sidebar inherits that order.
    const api = bars[0];
    expect(api !== undefined && isGroup(api)).toBe(true);
    expect(sidebarEntries([api as SidebarNode]).map((item) => item.slug)).toEqual([
      "packages/api/src",
      "packages/api/src/routes",
    ]);
  });

  it("leaves out a unit that has no page yet, and a project left empty by that", () => {
    const m    = manifest();
    const bars = buildSidebar(m, new Map([["packages/web:src", "src"]]));

    expect(bars).toHaveLength(1);
    expect(bars[0]?.label).toBe("@demo/web");
  });

  it("addresses pages the way Astro derives a slug, in lower case", () => {
    expect(slugFor(unit("p", "Components", "src/Components"))).toBe("src/components");
  });

  it("renders as valid JavaScript for the config file", () => {
    const m        = manifest();
    const rendered = renderSidebar(buildSidebar(m, new Map([["packages/api:src", "src"]])));

    expect(rendered).toContain('label: "@demo/api"');
    expect(rendered).toContain('{ label: "src", slug: "packages/api/src" },');
    expect(rendered.split("\n").every((line) => !line.endsWith(" "))).toBe(true);
  });
});

describe("the frontmatter Starlight gets", () => {
  const source = [
    "---",
    'title: "users"',
    'unit: "root:src/users"',
    'hash: "9f2c"',
    "files: 4",
    'generatedAt: "2026-01-01T00:00:00.000Z"',
    "---",
    "",
    "# users",
    "",
    "Everything about accounts, in one place.",
    "",
    "## Detail",
  ].join("\n");

  it("keeps the title and drops every key Starlight does not declare", () => {
    const page = toStarlightPage(source, "fallback");

    expect(page.title).toBe("users");
    expect(Object.keys(page)).toEqual(["title", "description", "body"]);
  });

  it("summarises the opening paragraph into a description", () => {
    expect(toStarlightPage(source, "fallback").description).toBe(
      "Everything about accounts, in one place.",
    );
  });

  it("drops the body's own H1, which Starlight would render a second time", () => {
    const page = toStarlightPage(source, "fallback");

    expect(page.body.startsWith("# users")).toBe(false);
    expect(page.body.startsWith("Everything about accounts")).toBe(true);
  });

  it("falls back to the unit name when the page carries no title", () => {
    expect(toStarlightPage("no frontmatter here", "the-unit").title).toBe("the-unit");
  });

  it("skips headings, fences and lists when looking for a summary", () => {
    expect(summarise("# Title\n\n```ts\ncode\n```\n\n- a list\n\nThe real opening line.")).toBe(
      "The real opening line.",
    );
  });

  it("cuts a long paragraph at a word boundary", () => {
    const long = summarise(`${"word ".repeat(80)}end.`);

    expect(long?.length).toBeLessThanOrEqual(164);
    expect(long?.endsWith("...")).toBe(true);
    expect(long).not.toContain("wor...");
  });

  it("leaves out the description when there is no prose to summarise", () => {
    expect(toStarlightPage("---\ntitle: \"x\"\n---\n\n# x\n", "x").description).toBeUndefined();
  });
});

describe("the scaffold", () => {
  it("writes a runnable Astro project", async () => {
    const { root } = await fixture();
    const result   = await runEject(root, { uiLang: "en" });

    for (const file of ["package.json", "astro.config.mjs", "src/content.config.ts", "README.md"]) {
      expect(await fs.readFile(path.join(result.outDir, file), "utf8")).toBeTruthy();
    }

    const pkg = JSON.parse(await fs.readFile(path.join(result.outDir, "package.json"), "utf8"));

    expect(pkg.dependencies).toHaveProperty("@astrojs/starlight");
    expect(pkg.dependencies).toHaveProperty("astro");
    expect(pkg.scripts.build).toBe("astro build");
  });

  it("copies one page per unit, plus the index", async () => {
    const { root } = await fixture();
    const result   = await runEject(root, { uiLang: "en" });

    expect(result.pages).toContain("packages/api/src.md");
    expect(result.pages).toContain("packages/api/src/routes.md");
    expect(result.pages).toContain("packages/web/src.md");
    expect(result.skipped).toEqual([]);
  });

  it("names the site after the workspace unless told otherwise", async () => {
    const { root } = await fixture();

    expect((await runEject(root, { uiLang: "en" })).title).toBe("demo");
    expect((await runEject(root, { uiLang: "en", title: "Riqsi API", force: true })).title).toBe(
      "Riqsi API",
    );
  });

  it("turns a title into a name npm will accept", () => {
    expect(packageName("Riqsi API")).toBe("riqsi-api-docs");
    expect(packageName("@demo/web")).toBe("demo-web-docs");
    expect(packageName("...")).toBe("docs-site");
  });

  it("declares the content collection Astro 5 needs to load the docs", () => {
    const files = templateFiles({ lang: "en", stats: { projects: 1, units: 3, files: 9, languages: [{ language: "typescript", count: 9 }], generatedAt: "2026-01-01T00:00:00.000Z" }, title: "demo", accent: DEFAULT_ACCENT, sidebar: [] });

    expect(files["src/content.config.ts"]).toContain("docsLoader()");
    expect(files["src/content.config.ts"]).toContain("docsSchema()");
  });
});

describe("overwriting", () => {
  it("refuses to touch an existing directory", async () => {
    const { root } = await fixture();

    await runEject(root, { uiLang: "en" });
    await expect(runEject(root, { uiLang: "en" })).rejects.toThrow(/already exists/);
  });

  it("overwrites with --force", async () => {
    const { root } = await fixture();
    const first    = await runEject(root, { uiLang: "en" });

    await fs.writeFile(path.join(first.outDir, "stale.txt"), "left over", "utf8");

    const second = await runEject(root, { uiLang: "en", force: true });

    expect(second.pages.length).toBeGreaterThan(0);
    expect(await fs.readFile(path.join(second.outDir, "package.json"), "utf8")).toBeTruthy();
  });
});

describe("when there is nothing to eject", () => {
  it("says to scan first when no manifest exists", async () => {
    const { root } = await fixture({ manifest: false });

    await expect(runEject(root, { uiLang: "en" })).rejects.toThrow(/no manifest/);
  });

  it("names the directory it looked in when no page has been written", async () => {
    const { root } = await fixture({ pages: false });

    // The path is the whole point: "no pages" without it sends the reader
    // looking in the directory they generated to, which is not the one glossic read.
    await expect(runEject(root, { uiLang: "en" })).rejects.toThrow(/looked for generated pages in/);
    await expect(runEject(root, { uiLang: "en" })).rejects.toThrow(/docs/);
    await expect(runEject(root, { uiLang: "en" })).rejects.toThrow(/--docs/);
  });

  it("names the templates it knows when given one it does not", async () => {
    const { root } = await fixture();

    await expect(runEject(root, { uiLang: "en", template: "docusaurus" })).rejects.toThrow(
      /unknown template/,
    );
  });
});

describe("finding the pages generate wrote", () => {
  it("follows the directory the manifest recorded, with no flag", async () => {
    const { root } = await fixture({ docsDir: "docs-riqsi", record: true });

    const result = await runEject(root, { uiLang: "en" });

    expect(result.docsDir.endsWith("docs-riqsi")).toBe(true);
    expect(result.pages.length).toBeGreaterThan(2);
    expect(result.skipped).toEqual([]);
  });

  it("lets an explicit --docs beat what the manifest recorded", async () => {
    const { root } = await fixture({ docsDir: "docs-riqsi", record: true });

    const elsewhere = path.join(root, "docs-elsewhere");
    await fs.cp(path.join(root, "docs-riqsi"), elsewhere, { recursive: true });

    const result = await runEject(root, { uiLang: "en", docs: elsewhere });

    expect(result.docsDir.endsWith("docs-elsewhere")).toBe(true);
    expect(result.skipped).toEqual([]);
  });

  it("reports the directory it read from, so an empty --docs is not a mystery", async () => {
    const { root } = await fixture({ docsDir: "docs-riqsi", record: true });

    const empty = path.join(root, "docs-empty");
    await fs.mkdir(empty, { recursive: true });

    await expect(runEject(root, { uiLang: "en", docs: empty })).rejects.toThrow(/docs-empty/);
  });

  it("falls back to the default for a manifest written before the field existed", async () => {
    const { root, manifest: m } = await fixture();

    expect(m).not.toHaveProperty("docsDir");

    const result = await runEject(root, { uiLang: "en" });

    expect(result.docsDir.endsWith("docs")).toBe(true);
    expect(result.pages.length).toBeGreaterThan(2);
  });

  it("prefers the config's output.dir over the default when the manifest is silent", async () => {
    const { root } = await fixture({ docsDir: "documentation" });

    await fs.writeFile(
      path.join(root, "glossic.config.ts"),
      'export default { output: { dir: "documentation" } };\n',
      "utf8",
    );

    const result = await runEject(root, { uiLang: "en" });

    expect(result.docsDir.endsWith("documentation")).toBe(true);
  });
});
