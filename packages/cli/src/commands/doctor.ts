import path from "node:path";
import process from "node:process";

import type { ConfigOrigins } from "@glossic/core";
import { probeProviders, resolveProvider } from "@glossic/core";
import type { Adapter, Provider } from "@glossic/schema";
import { Command } from "commander";

import { resolveEffectiveConfig } from "../config.js";
import type { Translator } from "../i18n/index.js";
import { createTranslator, defaultTranslator } from "../i18n/index.js";
import { builtinAdapters, builtinProviders } from "../registries.js";

export interface DoctorConfigEntry {
  key   : string;
  value : string;
  origin: string;
}

export interface DoctorReport {
  node      : string;
  platform  : string;
  providers : Array<{ name: string; available: boolean }>;
  selected  : string | undefined;
  adapters  : string[];
  configFile: string | undefined;
  config    : DoctorConfigEntry[];
  uiLang    : string;
  exitCode  : number;
}

/** Values are printed, so they have to survive being printed. */
const display = (value: unknown): string => {
  if (value === undefined) return "—";
  if (Array.isArray(value)) return value.length === 0 ? "[]" : value.join(", ");
  if (typeof value === "object" && value !== null) {
    return Object.entries(value)
      .map(([key, nested]) => `${key}=${String(nested)}`)
      .join(", ");
  }
  return String(value);
};

/** Every resolved option paired with the source that decided its value. */
const configEntries = (
  config: Record<string, unknown>,
  origins: ConfigOrigins,
): DoctorConfigEntry[] =>
  Object.keys(config)
    .sort()
    .map((key) => ({
      key,
      value : display(config[key]),
      origin: origins[key] ?? "default",
    }));

export interface DoctorOptions {
  root      : string;
  uiLang   ?: string | undefined;
  providers : readonly Provider[];
  adapters  : readonly Adapter[];
}

/** What glossic can see on this machine: providers, adapters and the effective config. */
export const collectDoctorReport = async (options: DoctorOptions): Promise<DoctorReport> => {
  const providers = await probeProviders(options.providers);
  const { config, origins, file } = await resolveEffectiveConfig({
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
    adapters  : options.adapters.map((adapter) => adapter.name),
    configFile: file,
    config    : configEntries(config as unknown as Record<string, unknown>, origins),
    uiLang    : config.uiLang,
    exitCode  : providers.some((entry) => entry.available) ? 0 : 1,
  };
};

/**
 * The effective configuration is part of the report because debugging "why did
 * glossic do that" is guesswork without knowing which source won for each
 * option.
 */
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
  lines.push(`${label("doctor.config")}  ${report.configFile ?? t("doctor.noConfigFile")}`);

  lines.push("", t("doctor.effectiveConfig"));

  const keyWidth    = Math.max(0, ...report.config.map((entry) => entry.key.length));
  const originWidth = Math.max(0, ...report.config.map((entry) => entry.origin.length));

  for (const entry of report.config) {
    lines.push(
      `  ${entry.key.padEnd(keyWidth)}  ${entry.origin.padEnd(originWidth)}  ${entry.value}`,
    );
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
