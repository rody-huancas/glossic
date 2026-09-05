import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import type { Manifest } from "@glossic/schema";
import { Command } from "commander";
import { compareStrings, readManifest, toPosix, unitDocPath } from "@glossic/core";

import { counted, displayPath } from "../../render/index.js";
import { templateFiles } from "./template.js";
import { createTranslator } from "../../i18n/index.js";
import { buildSidebar, pruneSidebar, slugFor } from "./sidebar.js";
import { pathTitle, sidebarLabel } from "./titles.js";
import { siteStrings } from "./site-strings.js";
import { siteStats, startSlug, structurePage, STRUCTURE_SLUG } from "./structure.js";
import { DEFAULT_ACCENT, normaliseHex } from "./theme.js";
import { renderStarlightPage, toStarlightPage } from "./frontmatter.js";
import { flagsToConfig, resolveEffectiveConfig } from "../../config.js";
import type { Translator } from "../../i18n/index.js";

export { buildSidebar, isGroup, pruneSidebar, renderSidebar, sidebarEntries, slugFor } from "./sidebar.js";
export { renderStarlightPage, summarise, toStarlightPage } from "./frontmatter.js";
export { extractHeading, looksLikePath, MAX_SIDEBAR_TITLE, pathTitle, sidebarLabel, titleCase } from "./titles.js";
export { accentPalette, customCss, DEFAULT_ACCENT, normaliseHex } from "./theme.js";
export { packageName, templateFiles } from "./template.js";
export { SITE_LANGUAGES, siteStrings } from "./site-strings.js";
export { siteStats, startSlug, startUnit, structurePage, STRUCTURE_SLUG } from "./structure.js";

export const TEMPLATES = ["starlight"] as const;

/** Where the site goes unless told otherwise, and the name `exclude` covers by default. */
export const DEFAULT_SITE_DIR = "docs-site";

const CONTENT_DIR = "src/content/docs";


/**
 * The `exclude` pattern a destination needs to stay out of the next scan, or
 * undefined when it is already covered: named like the default, or outside the
 * workspace and never walked. Glossic should not document its own output, and
 * a scaffolded site is source the scan would otherwise read as the project's.
 */
export const sitePattern = (root: string, outDir: string): string | undefined => {
  const inside = path.relative(root, outDir);

  if (inside === "" || inside.startsWith("..") || path.isAbsolute(inside)) {
    return undefined;
  }

  const name = path.basename(outDir);

  return name === DEFAULT_SITE_DIR ? undefined : `**/${name}/**`;
};

export interface EjectOptions {
  template   ?: string;
  docs       ?: string;
  out        ?: string;
  title      ?: string;
  description?: string;
  accent     ?: string;
  force      ?: boolean;
  uiLang     ?: string;
  quiet      ?: boolean;
}

export interface EjectResult {
  docsDir       : string;
  outDir        : string;
  title         : string;
  accent        : string;
  pages         : string[];
  skipped       : string[];
  template      : string;
  excludePattern: string | undefined;
}

export const resolveDocsDir = (
  paths     : { cwd: string; root: string },
  explicit  : string | undefined,
  recorded  : string | undefined,
  fromConfig: string,
): string => {
  if (explicit !== undefined) {
    return path.resolve(paths.cwd, explicit);
  }

  return path.resolve(paths.root, recorded ?? fromConfig);
};


/** True when the path exists at all, whatever it is. */
const exists = async (target: string): Promise<boolean> =>
  fs
    .access(target)
    .then(() => true)
    .catch(() => false);

const write = async (target: string, content: string): Promise<void> => {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
};


const copyUnitPages = async (
  manifest  : Manifest,
  docsDir   : string,
  contentDir: string,
): Promise<{ labels: Map<string, string>; pages: string[]; skipped: string[] }> => {
  const labels = new Map<string, string>();
  const pages: string[] = [];
  const skipped: string[] = [];

  for (const unit of manifest.units) {
    const source = path.resolve(docsDir, unitDocPath(unit));

    if (!(await exists(source))) {
      skipped.push(unit.id);
      continue;
    }

    const raw  = await fs.readFile(source, "utf8");
    const page = toStarlightPage(raw, pathTitle(unit.path), unit.path);

    await write(path.resolve(contentDir, `${slugFor(unit)}.md`), renderStarlightPage(page));

    labels.set(unit.id, sidebarLabel(page.title, unit.path));
    pages.push(`${slugFor(unit)}.md`);
  }

  return { labels, pages, skipped };
};


export const runEject = async (target: string, options: EjectOptions = {}): Promise<EjectResult> => {
  const cwd  = process.cwd();
  const root = path.resolve(cwd, target);

  const { config } = await resolveEffectiveConfig({
    root,
    flags: flagsToConfig({ uiLang: options.uiLang }),
  });

  const t        = createTranslator(config.uiLang);
  const template = options.template ?? TEMPLATES[0];

  if (!TEMPLATES.includes(template as (typeof TEMPLATES)[number])) {
    throw new Error(t("eject.unknownTemplate", { template, known: TEMPLATES.join(", ") }));
  }

  const accent = options.accent === undefined ? DEFAULT_ACCENT : normaliseHex(options.accent);

  if (accent === undefined) {
    throw new Error(t("eject.badAccent", { accent: options.accent ?? "" }));
  }

  const manifestPath = path.resolve(root, config.output.manifest);
  const manifest     = await readManifest(manifestPath);

  if (manifest === undefined) {
    throw new Error(t("eject.noManifest", { path: displayPath(cwd, manifestPath) }));
  }

  const docsDir = resolveDocsDir({ cwd, root }, options.docs, manifest.docsDir, config.output.dir);

  if (!(await exists(docsDir))) {
    throw new Error(t("eject.noDocs", { path: displayPath(cwd, docsDir) }));
  }

  const outDir = options.out === undefined
    ? path.resolve(root, DEFAULT_SITE_DIR)
    : path.resolve(cwd, options.out);

  if ((await exists(outDir)) && options.force !== true) {
    throw new Error(t("eject.exists", { path: displayPath(cwd, outDir) }));
  }

  const title      = options.title ?? manifest.workspace.name;
  const contentDir = path.resolve(outDir, CONTENT_DIR);

  const { labels, pages, skipped } = await copyUnitPages(manifest, docsDir, contentDir);

  if (pages.length === 0) {
    throw new Error(t("eject.noPages", { path: displayPath(cwd, docsDir) }));
  }

  const documented = new Set(labels.keys());

  const written = new Set([STRUCTURE_SLUG, ...pages.map((page) => page.replace(/\.md$/, ""))]);

  const sidebar = pruneSidebar(
    [
      { label: siteStrings(config.lang).structure, slug: STRUCTURE_SLUG },
      ...buildSidebar(manifest, labels),
    ],
    written,
  );

  const files = templateFiles({
    title,
    ...(options.description === undefined ? {} : { description: options.description }),
    accent,
    lang     : config.lang,
    stats    : siteStats(manifest),
    startSlug: startSlug(manifest, documented),
    sidebar,
  });

  for (const [name, content] of Object.entries(files)) {
    await write(path.resolve(outDir, name), content);
  }

  await write(
    path.resolve(contentDir, `${STRUCTURE_SLUG}.md`),
    structurePage(manifest, config.lang, documented),
  );

  pages.push("index.mdx", `${STRUCTURE_SLUG}.md`);

  return {
    docsDir: toPosix(docsDir),
    outDir : toPosix(outDir),
    title,
    accent,
    pages         : pages.sort(compareStrings),
    skipped       : skipped.sort(compareStrings),
    template,
    excludePattern: sitePattern(root, outDir),
  };
};

/** What the command prints once the scaffold is on disk. */
export const renderEjectReport = (result: EjectResult, cwd: string, t: Translator): string => {
  const lines = [
    "",
    counted(t, result.pages.length, "eject.done", { path: displayPath(cwd, result.outDir) }),
  ];

  if (result.skipped.length > 0) {
    lines.push(counted(t, result.skipped.length, "eject.skipped"));
  }

  if (result.excludePattern !== undefined) {
    lines.push(
      "",
      t("eject.notExcluded", { path: displayPath(cwd, result.outDir) }),
      "",
      `  exclude: ["${result.excludePattern}"],`,
    );
  }

  lines.push("", t("eject.next"), "", `  cd ${displayPath(cwd, result.outDir)}`, "  npm install", "  npm run dev", "");

  return lines.join("\n");
};

export const ejectCommand = (): Command =>
  new Command("eject")
    .description("scaffold a documentation site from the generated markdown")
    .argument("[path]", "workspace root", ".")
    .option("--template <name>", `site template: ${TEMPLATES.join(", ")}`, TEMPLATES[0])
    .option("--docs <dir>", "where the generated markdown is; default the directory generate recorded")
    .option("--out <dir>", `destination; relative to the cwd, default <root>/${DEFAULT_SITE_DIR}`)
    .option("--title <text>", "site title, default the detected project name")
    .option("--description <text>", "site tagline, shown on the landing page")
    .option("--accent <hex>", `accent colour, default ${DEFAULT_ACCENT}`)
    .option("--force", "overwrite the destination if it already exists", false)
    .option("--ui-lang <code>", "language of the CLI itself: en or es")
    .option("-q, --quiet", "no banner", false)
    .action(async (pathArg: string, options: EjectOptions) => {
      const result = await runEject(pathArg, options);
      const { config } = await resolveEffectiveConfig({
        root : path.resolve(process.cwd(), pathArg),
        flags: flagsToConfig({ uiLang: options.uiLang }),
      });

      process.stdout.write(renderEjectReport(result, process.cwd(), createTranslator(config.uiLang)));
    });
