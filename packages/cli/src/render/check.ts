import type { CheckResult } from "@glossic/core";

import { counted, displayPath } from "./shared.js";
import { defaultTranslator } from "../i18n/index.js";
import type { Translator } from "../i18n/index.js";

export interface CheckReportContext {
  cwd    : string;
  target : string;
  t     ?: Translator | undefined;
}

/**
 * Renders the check report. Its job is to name the exact files to regenerate:
 * this is what a developer reads after a failing CI job.
 */
export const renderCheckReport = (result: CheckResult, context: CheckReportContext): string => {
  const t        = context.t ?? defaultTranslator;
  const docs     = displayPath(context.cwd, result.outDir);
  const problems = result.missing.length + result.stale.length + result.orphaned.length;

  if (result.ok) {
    return `${t("check.upToDate", {
      units: counted(t, result.upToDate.length, "unit"),
      out: docs,
    })}\n`;
  }

  const labels = {
    stale   : t("check.stale"),
    missing : t("check.missing"),
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
      units   : counted(t, result.upToDate.length, "unit"),
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
