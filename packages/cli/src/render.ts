import path from "node:path";

import type { CheckResult, GenerateResult, ScanResult } from "@glossic/core";
import { toPosix } from "@glossic/core";
import type { Manifest, Unit } from "@glossic/schema";

import type { MessageKey, Translator } from "./i18n/messages.js";
import { defaultTranslator } from "./i18n/messages.js";

/** Counted nouns need both forms, and Spanish does not pluralise with an "s". */
export const counted = (
  t: Translator,
  count: number,
  noun: "project" | "unit" | "file" | "problem",
) => t(`count.${noun}${count === 1 ? "" : "s"}` as MessageKey, { count });

const dominantLanguage = (unit: Unit): string => unit.facts.base.languages[0]?.language ?? "-";

const countLanguages = (units: readonly Unit[]): Array<[string, number]> => {
  const totals = new Map<string, number>();
  for (const unit of units) {
    for (const entry of unit.facts.base.languages) {
      totals.set(entry.language, (totals.get(entry.language) ?? 0) + entry.count);
    }
  }

  return [...totals.entries()].sort(
    ([aLang, aCount], [bLang, bCount]) => bCount - aCount || (aLang < bLang ? -1 : 1),
  );
};

const workspaceHeadline = (manifest: Manifest, t: Translator): string => {
  const { workspace } = manifest;
  const kind = workspace.isMonorepo
    ? t("scan.monorepo", { tool: workspace.tool })
    : t("scan.singleProject");
  const manager = workspace.packageManager;

  // The tool already names the package manager for pnpm workspaces.
  const suffix = manager === undefined || manager === workspace.tool ? "" : `, ${manager}`;
  return `${workspace.name} — ${kind}${suffix}`;
};

/**
 * Renders the scan report. Every list it walks is already sorted by
 * `buildManifest`, so the output only depends on the code that was scanned.
 */
export const renderScanReport = (result: ScanResult, t: Translator = defaultTranslator): string => {
  const { manifest } = result;
  const { units } = manifest;

  const nameWidth = Math.max(0, ...units.map((unit) => unit.name.length));
  const filesWidth = Math.max(
    0,
    ...units.map((unit) => counted(t, unit.facts.base.files.length, "file").length),
  );
  const languageWidth = Math.max(0, ...units.map((unit) => dominantLanguage(unit).length));

  const lines: string[] = [workspaceHeadline(manifest, t), ""];

  for (const project of manifest.workspace.projects) {
    const projectUnits = units.filter((unit) => unit.projectId === project.id);
    lines.push(`${project.name} (${project.rootDir})`);

    if (projectUnits.length === 0) {
      lines.push(`  ${t("scan.noSourceFiles")}`);
      lines.push("");
      continue;
    }

    projectUnits.forEach((unit, index) => {
      const branch = index === projectUnits.length - 1 ? "└─" : "├─";
      const columns = [
        unit.name.padEnd(nameWidth),
        counted(t, unit.facts.base.files.length, "file").padStart(filesWidth),
        dominantLanguage(unit).padEnd(languageWidth),
        unit.facts.base.roleHint ?? "",
      ];
      lines.push(`${branch} ${columns.join("  ")}`.trimEnd());
    });

    lines.push("");
  }

  const totalFiles = units.reduce((sum, unit) => sum + unit.facts.base.files.length, 0);
  lines.push(
    t("scan.summary", {
      projects: counted(t, manifest.workspace.projects.length, "project"),
      units: counted(t, units.length, "unit"),
      files: counted(t, totalFiles, "file"),
    }),
  );

  const languages = countLanguages(units);
  if (languages.length > 0) {
    lines.push(
      t("scan.languages", {
        list: languages.map(([lang, count]) => `${lang} ${count}`).join(", "),
      }),
    );
  }

  return `${lines.join("\n")}\n`;
};

export interface GenerateReportContext {
  outDir: string;
  cwd: string;
  provider: string | undefined;
  /** The resolved documentation language, and where it was resolved from. */
  language?: { code: string; origin: string } | undefined;
  t?: Translator | undefined;
}

const formatTokens = (tokens: number): string =>
  tokens < 1000 ? `${tokens}` : `~${Math.round(tokens / 1000)}k`;

/** A path outside the cwd reads better absolute than as a pile of "../". */
export const displayPath = (cwd: string, target: string): string => {
  const relative = toPosix(path.relative(cwd, target));
  return relative === "" || relative.startsWith("..") ? toPosix(target) : relative;
};

/** Renders the generate report, for both a dry run and a real run. */
export const renderGenerateReport = (
  result: GenerateResult,
  context: GenerateReportContext,
): string => {
  const t = context.t ?? defaultTranslator;
  const relativeOut = displayPath(context.cwd, context.outDir);
  const nameWidth = Math.max(0, ...result.plan.map((entry) => entry.unitId.length));

  const language =
    context.language === undefined
      ? ""
      : `  ·  ${t("generate.language", {
          code: context.language.code,
          origin: context.language.origin,
        })}`;

  const lines: string[] = [];

  lines.push(
    result.dryRun
      ? `${t("generate.dryRun", { out: relativeOut })}${language}`
      : `${t("generate.provider", { provider: context.provider ?? "none" })}${language}`,
    "",
  );

  for (const entry of result.plan) {
    lines.push(
      [
        `  ${entry.unitId.padEnd(nameWidth)}`,
        counted(t, entry.files, "file").padStart(9),
        t("generate.tokens", { tokens: formatTokens(entry.estimatedTokens) }).padStart(13),
        entry.reason.padEnd(22),
        entry.docPath,
      ].join("  "),
    );
  }

  if (result.plan.length > 0) lines.push("");

  const generated = result.dryRun
    ? result.plan.filter((entry) => entry.regenerate).length
    : result.generated;

  const counts = [
    t("generate.counts", {
      generated,
      cached: result.fromCache,
      failed: result.failures.length,
    }),
  ];
  if (result.filteredOut.length > 0) {
    counts.push(t("generate.filteredOut", { count: result.filteredOut.length }));
  }
  lines.push(counts.join(", "));

  const tokens = formatTokens(result.estimatedTokens);
  lines.push(
    result.dryRun
      ? t("generate.inputTokensEstimated", { tokens })
      : t("generate.inputTokens", { tokens }),
  );

  if (result.savedTokens > 0) {
    lines.push(t("generate.savedTokens", { tokens: formatTokens(result.savedTokens) }));
  }

  if (!result.dryRun) {
    lines.push(t("generate.written", { count: result.written.length, out: relativeOut }));
  }

  for (const warning of result.warnings) {
    lines.push(`  ${t("generate.trimmed", { unit: warning.unitId, message: warning.message })}`);
  }

  for (const failure of result.failures) {
    const code = failure.code === undefined ? "" : ` [${failure.code}]`;
    lines.push(`  ${t("generate.failed", { unit: failure.unitId, code, reason: failure.reason })}`);
    if (failure.detail !== undefined) lines.push(`          ${failure.detail}`);
  }

  return `${lines.join("\n")}\n`;
};

export interface CheckReportContext {
  cwd: string;
  /** The path argument the user passed, echoed back in the fix instructions. */
  target: string;
  t?: Translator | undefined;
}

/**
 * Renders the check report. Its job is to name the exact files to regenerate:
 * this is what a developer reads after a failing CI job.
 */
export const renderCheckReport = (result: CheckResult, context: CheckReportContext): string => {
  const t = context.t ?? defaultTranslator;
  const docs = displayPath(context.cwd, result.outDir);
  const problems = result.missing.length + result.stale.length + result.orphaned.length;

  if (result.ok) {
    return `${t("check.upToDate", {
      units: counted(t, result.upToDate.length, "unit"),
      out: docs,
    })}\n`;
  }

  const labels = {
    stale: t("check.stale"),
    missing: t("check.missing"),
    orphaned: t("check.orphaned"),
  };
  const labelPad = Math.max(...Object.values(labels).map((label) => label.length));

  const pathWidth = Math.max(
    0,
    ...[...result.stale, ...result.missing].map((entry) => `${docs}/${entry.docPath}`.length),
    ...result.orphaned.map((doc) => `${docs}/${doc}`.length),
  );

  const row = (label: string, file: string, reason: string): string =>
    `  ${label.padEnd(labelPad)}  ${`${docs}/${file}`.padEnd(pathWidth)}  ${reason}`;

  const lines = [t("check.outOfDate"), ""];

  for (const entry of result.stale) {
    lines.push(row(labels.stale, entry.docPath, t("check.staleReason", { unit: entry.unitId })));
  }

  for (const entry of result.missing) {
    lines.push(
      row(labels.missing, entry.docPath, t("check.missingReason", { unit: entry.unitId })),
    );
  }

  for (const doc of result.orphaned) {
    lines.push(row(labels.orphaned, doc, t("check.orphanedReason")));
  }

  lines.push(
    "",
    t("check.problems", {
      problems: counted(t, problems, "problem"),
      units: counted(t, result.upToDate.length, "unit"),
    }),
    "",
  );

  if (result.stale.length + result.missing.length > 0) {
    lines.push(t("check.regenerate"), "");
    lines.push(`  glossic generate ${context.target}`, "");
    lines.push(t("check.cacheNote"), "");
  }

  if (result.orphaned.length > 0) {
    lines.push(t("check.deleteOrphans"), "");
    for (const doc of result.orphaned) lines.push(`  rm ${docs}/${doc}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
};
