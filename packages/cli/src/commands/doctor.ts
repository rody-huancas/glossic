import path from "node:path";
import process from "node:process";

import type { ConfigOrigins } from "@glossic/core";
import { probeProviders, resolveProvider } from "@glossic/core";
import type { Adapter, Provider } from "@glossic/schema";
import { Command } from "commander";

import { resolveEffectiveConfig } from "../config.js";
import { builtinAdapters, builtinProviders } from "../registries.js";

export interface DoctorConfigEntry {
  key: string;
  value: string;
  origin: string;
}

export interface DoctorReport {
  node: string;
  platform: string;
  providers: Array<{ name: string; available: boolean }>;
  selected: string | undefined;
  adapters: string[];
  configFile: string | undefined;
  /** Every effective option and where its value came from. */
  config: DoctorConfigEntry[];
  /** 0 when at least one provider can be used. */
  exitCode: number;
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

const configEntries = (
  config: Record<string, unknown>,
  origins: ConfigOrigins,
): DoctorConfigEntry[] =>
  Object.keys(config)
    .sort()
    .map((key) => ({
      key,
      value: display(config[key]),
      origin: origins[key] ?? "default",
    }));

export interface DoctorOptions {
  root: string;
  providers: readonly Provider[];
  adapters: readonly Adapter[];
}

export const collectDoctorReport = async (options: DoctorOptions): Promise<DoctorReport> => {
  const providers = await probeProviders(options.providers);
  const { config, origins, file } = await resolveEffectiveConfig({ root: options.root });

  const selected = await resolveProvider({ providers: options.providers })
    .then((provider) => provider.name)
    .catch(() => undefined);

  return {
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    providers,
    selected,
    adapters: options.adapters.map((adapter) => adapter.name),
    configFile: file,
    config: configEntries(config as unknown as Record<string, unknown>, origins),
    exitCode: providers.some((entry) => entry.available) ? 0 : 1,
  };
};

const mark = (ok: boolean): string => (ok ? "ok     " : "missing");

export const renderDoctorReport = (report: DoctorReport): string => {
  const lines = [
    "glossic doctor",
    "",
    `node        ${report.node}`,
    `platform    ${report.platform}`,
    "",
    "providers",
  ];

  for (const provider of report.providers) {
    const selected = provider.name === report.selected ? "  <- would be used" : "";
    lines.push(`  ${mark(provider.available)}  ${provider.name}${selected}`);
  }

  lines.push("", `adapters    ${report.adapters.join(", ")}`);
  lines.push(`config      ${report.configFile ?? "none (glossic.config.ts not found)"}`);

  // Debugging "why did glossic do that" is guesswork without knowing which
  // source won for each option.
  lines.push("", "effective configuration");

  const keyWidth = Math.max(0, ...report.config.map((entry) => entry.key.length));
  const originWidth = Math.max(0, ...report.config.map((entry) => entry.origin.length));

  for (const entry of report.config) {
    lines.push(
      `  ${entry.key.padEnd(keyWidth)}  ${entry.origin.padEnd(originWidth)}  ${entry.value}`,
    );
  }

  lines.push("");

  if (report.selected === undefined) {
    lines.push(
      "No provider is available. Pick one:",
      "",
      "  1. Claude Code — install the CLI and sign in:",
      "       https://claude.com/claude-code",
      "     glossic picks it up as soon as `claude --version` works.",
      "",
      "  2. Anthropic API — export an API key:",
      "       export ANTHROPIC_API_KEY=sk-ant-...",
      "       https://console.anthropic.com/settings/keys",
      "",
    );
  } else {
    lines.push(`Ready: \`glossic generate\` would use ${report.selected}.`, "");
  }

  return lines.join("\n");
};

export const doctorCommand = (): Command =>
  new Command("doctor")
    .description("check node, providers, adapters and config")
    .argument("[path]", "workspace root", ".")
    .option("-q, --quiet", "no banner", false)
    .action(async (target: string) => {
      const report = await collectDoctorReport({
        root: path.resolve(process.cwd(), target),
        providers: builtinProviders,
        adapters: builtinAdapters,
      });

      process.stdout.write(renderDoctorReport(report));
      process.exitCode = report.exitCode;
    });
