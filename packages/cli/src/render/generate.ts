import type { GenerateResult, PlanReview } from "@glossic/core";

import { counted, displayPath } from "./shared.js";
import { defaultTranslator } from "../i18n/index.js";
import type { Translator } from "../i18n/index.js";

export interface GenerateReportContext {
  outDir   : string;
  cwd      : string;
  provider : string | undefined;
  language?: { code: string; origin: string } | undefined;
  t       ?: Translator | undefined;
}

/**
 * Token counts round to thousands past a thousand, since the number is an
 * estimate either way. The "~" that says so is added here and only here: a
 * catalogue string that carried its own printed it twice.
 */
export const formatTokens = (tokens: number): string =>
  tokens < 1000 ? `${tokens}` : `~${Math.round(tokens / 1000)}k`;

/**
 * What generate says before it sends anything: how much of the plan the cache
 * already covers, and a warning when the rest is large enough that one run
 * could cost a whole quota.
 *
 * It is printed in every mode. Without a terminal to ask on, saying so and
 * carrying on is the whole of the feature; with one, the caller follows it
 * with the question.
 */
export const renderPlanIntro = (review: PlanReview, warnAbove: number, t: Translator = defaultTranslator): string => {
  const lines: string[] = [];

  if (review.cached > 0) {
    lines.push(
      [
        counted(t, review.pending, "count.pending"),
        counted(t, review.cached, "count.done"),
      ].join(", "),
    );
  }

  if (review.pending > warnAbove) {
    lines.push(
      t("generate.largePlan", {
        units : counted(t, review.pending, "count.unit"),
        tokens: formatTokens(review.estimatedTokens),
      }),
      t("generate.largePlanRisk"),
    );
  }

  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
};

/** Renders the generate report, for both a dry run and a real run. */
export const renderGenerateReport = (result: GenerateResult, context: GenerateReportContext): string => {
  const t           = context.t ?? defaultTranslator;
  const relativeOut = displayPath(context.cwd, context.outDir);
  const nameWidth   = Math.max(0, ...result.plan.map((entry) => entry.unitId.length));

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
        counted(t, entry.files, "count.file").padStart(9),
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
    counted(t, generated, "count.written"),
    counted(t, result.fromCache, "count.cached"),
    counted(t, result.failures.length, "count.failed"),
  ];

  if (result.filteredOut.length > 0) {
    counts.push(counted(t, result.filteredOut.length, "generate.filteredOut"));
  }

  if (result.skipped.length > 0) {
    counts.push(t("generate.skipped", { count: result.skipped.length }));
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
    lines.push(counted(t, result.written.length, "generate.written", { out: relativeOut }));
  }

  for (const warning of result.warnings) {
    const message = counted(t, warning.dropped, "generate.droppedPreamble", {
      excerpt: warning.excerpt,
    });

    lines.push(`  ${t("generate.trimmed", { unit: warning.unitId, message })}`);
  }

  for (const failure of result.failures) {
    const code = failure.code === undefined ? "" : ` [${failure.code}]`;

    lines.push(`  ${t("generate.failed", { unit: failure.unitId, code, reason: failure.reason })}`);
    
    if (failure.detail !== undefined) {
      lines.push(`          ${failure.detail}`);
    }
  }

  if (result.aborted !== undefined) {
    lines.push(
      "",
      counted(t, result.aborted.remaining, "generate.stopped", {
        unit: result.aborted.unitId,
        code: result.aborted.code,
      }),
      t("generate.resume"),
    );
  }

  return `${lines.join("\n")}\n`;
};
