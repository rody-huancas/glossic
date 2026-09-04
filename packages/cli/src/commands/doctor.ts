import path from "node:path";
import process from "node:process";

import type { ConfigOrigins, ProjectConfig } from "@glossic/core";
import { probeProviders, resolveProvider } from "@glossic/core";
import { ADDITIVE_LIST_KEYS, LIST_DEFAULTS } from "@glossic/schema";
import type { Adapter, ListOverrides, Provider } from "@glossic/schema";
import { Command } from "commander";

import { resolveEffectiveConfig } from "../config.js";
import type { Translator } from "../i18n/index.js";
import { createTranslator, defaultTranslator } from "../i18n/index.js";
import { languageLabel } from "../language.js";
import { builtinAdapters, builtinProviders } from "../registries.js";

export interface DoctorConfigEntry {
  key   : string;
  value : string;
  origin: string;
}

export interface DoctorListRow {
  mark   : "default" | "added" | "removed";
  pattern: string;
}

export interface DoctorList {
  key : string;
  rows: DoctorListRow[];
}

export interface DoctorReport {
  node         : string;
  platform     : string;
  providers    : Array<{ name: string; available: boolean }>;
  selected     : string | undefined;
  adapters     : string[];
  projectConfig: ProjectConfig;
  config       : DoctorConfigEntry[];
  lists        : DoctorList[];
  lang         : string;
  uiLang       : string;
  exitCode     : number;
}

const display = (value: unknown): string => {
  if (value === undefined) {
    return "—";
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : value.join(", ");
  }

  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .map(([key, nested]) => `${key}=${String(nested)}`)
      .join(", ");
  }

  return String(value);
};

const summarize = (lists: ListOverrides, key: string): string | undefined => {
  const override = lists[key as keyof ListOverrides];

  if (override === undefined) {
    return undefined;
  }

  const edits = [
    override.added.length === 0 ? "" : `+${override.added.length}`,
    override.removed.length === 0 ? "" : `-${override.removed.length}`,
  ].filter((part) => part !== "");

  return edits.length === 0
    ? `${override.value.length}`
    : `${override.value.length} (${edits.join(", ")})`;
};


/** Every resolved option paired with the source that decided its value. */
const configEntries = (config: Record<string, unknown>, origins: ConfigOrigins, lists: ListOverrides): DoctorConfigEntry[] =>
  Object.keys(config)
    .sort()
    .map((key) => ({
      key,
      value : summarize(lists, key) ?? display(config[key]),
      origin: origins[key] ?? "default",
    }));


const configLists = (lists: ListOverrides): DoctorList[] =>
  ADDITIVE_LIST_KEYS.map((key) => {
    const override = lists[key];

    const rows: DoctorListRow[] = LIST_DEFAULTS[key].map((pattern) => ({
      mark: override.removed.includes(pattern) ? ("removed" as const) : ("default" as const),
      pattern,
    }));

    for (const pattern of override.added) {
      rows.push({ mark: "added", pattern });
    }

    return { key, rows };
  });


const configLine = (project: ProjectConfig, t: Translator): string => {
  if (project.status === "missing") {
    return t("doctor.noConfigFile");
  }

  if (project.status === "failed") {
    return t("doctor.configFailed", { path: project.file, error: project.error });
  }

  return Object.keys(project.values).length === 0
    ? t("doctor.configEmpty", { path: project.file })
    : project.file;
};

export interface DoctorOptions {
  root      : string;
  uiLang   ?: string | undefined;
  providers : readonly Provider[];
  adapters  : readonly Adapter[];
}

export const collectDoctorReport = async (options: DoctorOptions): Promise<DoctorReport> => {
  const providers = await probeProviders(options.providers);
  const { config, origins, project, lists } = await resolveEffectiveConfig({
    root: options.root,
    ...(options.uiLang === undefined ? {} : { flags: { uiLang: options.uiLang as "en" | "es" } }),
  });

  const selected = await resolveProvider({ providers: options.providers })
    .then((provider) => provider.name)
    .catch(() => undefined);

  return {
    node    : process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    providers,
    selected,
    adapters     : options.adapters.map((adapter) => adapter.name),
    projectConfig: project,
    config       : configEntries(config as unknown as Record<string, unknown>, origins, lists),
    lists        : configLists(lists),
    lang         : config.lang,
    uiLang       : config.uiLang,
    exitCode     : providers.some((entry) => entry.available) ? 0 : 1,
  };
};


export const renderDoctorSummary = (report: DoctorReport, translator?: Translator): string => {
  const t = translator ?? createTranslator(report.uiLang) ?? defaultTranslator;

  const label = (key: Parameters<Translator>[0]): string =>
    t(key).padEnd(
      Math.max(
        t("doctor.node").length,
        t("doctor.provider").length,
        t("doctor.adapters").length,
        t("doctor.languages").length,
      ),
    );

  const provider = report.selected ?? t("status.noProvider");
  const langs    = t("doctor.languagesValue", {
    docs     : languageLabel(t, report.lang),
    interface: languageLabel(t, report.uiLang),
  });

  const lines = [
    "",
    `${label("doctor.node")}  ${report.node}`,
    `${label("doctor.provider")}  ${provider}`,
    `${label("doctor.adapters")}  ${report.adapters.join(", ")}`,
    `${label("doctor.languages")}  ${langs}`,
    "",
  ];

  const project = report.projectConfig;

  if (project.status === "failed") {
    lines.push(t("doctor.configIgnored", { path: project.file, error: project.error }), "");
  }

  if (report.selected === undefined) {
    lines.push(t("doctor.noProvider"), "");
  }

  return lines.join("\n");
};


export const renderDoctorReport = (report: DoctorReport, translator?: Translator): string => {
  const t = translator ?? createTranslator(report.uiLang) ?? defaultTranslator;

  const ok        = t("doctor.ok");
  const missing   = t("doctor.missing");
  const markWidth = Math.max(ok.length, missing.length);
  const mark      = (available: boolean): string => (available ? ok : missing).padEnd(markWidth);

  const label = (key: Parameters<Translator>[0]): string =>
    t(key).padEnd(
      Math.max(
        t("doctor.node").length,
        t("doctor.platform").length,
        t("doctor.adapters").length,
        t("doctor.config").length,
      ),
    );

  const lines = [
    t("doctor.title"),
    "",
    `${label("doctor.node")}  ${report.node}`,
    `${label("doctor.platform")}  ${report.platform}`,
    "",
    t("doctor.providers"),
  ];

  for (const provider of report.providers) {
    const selected = provider.name === report.selected ? `  ${t("doctor.wouldBeUsed")}` : "";
    lines.push(`  ${mark(provider.available)}  ${provider.name}${selected}`);
  }

  lines.push("", `${label("doctor.adapters")}  ${report.adapters.join(", ")}`);
  lines.push(`${label("doctor.config")}  ${configLine(report.projectConfig, t)}`);

  lines.push("", t("doctor.effectiveConfig"));

  const keyWidth    = Math.max(0, ...report.config.map((entry) => entry.key.length));
  const originWidth = Math.max(0, ...report.config.map((entry) => entry.origin.length));

  for (const entry of report.config) {
    lines.push(
      `  ${entry.key.padEnd(keyWidth)}  ${entry.origin.padEnd(originWidth)}  ${entry.value}`,
    );
  }

  lines.push("", t("doctor.additiveLists"), `  ${t("doctor.additiveHint")}`);

  const markWidthList = Math.max(
    0,
    ...report.lists.flatMap((list) => list.rows.map((row) => row.mark.length)),
  );

  for (const list of report.lists) {
    lines.push("", `  ${list.key}`);

    for (const row of list.rows) {
      lines.push(`    ${row.mark.padEnd(markWidthList)}  ${row.pattern}`);
    }
  }

  lines.push("");

  if (report.selected === undefined) {
    lines.push(
      t("doctor.noProvider"),
      "",
      `  ${t("provider.option1")}`,
      "       https://claude.com/claude-code",
      `     ${t("provider.option1Detail")}`,
      "",
      `  ${t("provider.option2")}`,
      "       export ANTHROPIC_API_KEY=sk-ant-...",
      "       https://console.anthropic.com/settings/keys",
      "",
    );
  } else {
    lines.push(t("doctor.ready", { provider: report.selected }), "");
  }

  return lines.join("\n");
};

export const doctorCommand = (): Command =>
  new Command("doctor")
    .description("check node, providers, adapters and config")
    .argument("[path]", "workspace root", ".")
    .option("--ui-lang <code>", "language of the CLI itself: en or es")
    .option("-q, --quiet", "no banner", false)
    .action(async (target: string, options: { uiLang?: string }) => {
      const report = await collectDoctorReport({
        root     : path.resolve(process.cwd(), target),
        providers: builtinProviders,
        adapters : builtinAdapters,
        ...(options.uiLang === undefined ? {} : { uiLang: options.uiLang }),
      });

      process.stdout.write(renderDoctorReport(report));
      process.exitCode = report.exitCode;
    });
