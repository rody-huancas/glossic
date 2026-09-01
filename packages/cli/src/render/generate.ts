import type { GenerateResult } from "@glossic/core";

import { counted, displayPath } from "./shared.js";
import { defaultTranslator } from "../i18n/index.js";
import type { Translator } from "../i18n/index.js";

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
