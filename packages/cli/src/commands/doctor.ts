import path from "node:path";
import process from "node:process";

import { findConfigFile, probeProviders, resolveProvider } from "@glosik/core";
import type { Adapter, Provider } from "@glosik/schema";
import { Command } from "commander";

import { builtinAdapters, builtinProviders } from "../registries.js";

export interface DoctorReport {
  node: string;
  platform: string;
  providers: Array<{ name: string; available: boolean }>;
  selected: string | undefined;
  adapters: string[];
  configFile: string | undefined;
  /** 0 when at least one provider can be used. */
  exitCode: number;
}

export interface DoctorOptions {
  root: string;
  providers: readonly Provider[];
  adapters: readonly Adapter[];
}

export const collectDoctorReport = async (options: DoctorOptions): Promise<DoctorReport> => {
  const providers = await probeProviders(options.providers);
  const configFile = await findConfigFile(options.root);

  const selected = await resolveProvider({ providers: options.providers })
    .then((provider) => provider.name)
    .catch(() => undefined);

  return {
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    providers,
    selected,
    adapters: options.adapters.map((adapter) => adapter.name),
    configFile,
    exitCode: providers.some((entry) => entry.available) ? 0 : 1,
  };
};

const mark = (ok: boolean): string => (ok ? "ok     " : "missing");

export const renderDoctorReport = (report: DoctorReport): string => {
  const lines = [
    "glosik doctor",
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
  lines.push(`config      ${report.configFile ?? "none (glosik.config.ts not found)"}`);
  lines.push("");

  if (report.selected === undefined) {
    lines.push(
      "No provider is available. Pick one:",
      "",
      "  1. Claude Code — install the CLI and sign in:",
      "       https://claude.com/claude-code",
      "     glosik picks it up as soon as `claude --version` works.",
      "",
      "  2. Anthropic API — export an API key:",
      "       export ANTHROPIC_API_KEY=sk-ant-...",
      "       https://console.anthropic.com/settings/keys",
      "",
    );
  } else {
    lines.push(`Ready: \`glosik generate\` would use ${report.selected}.`, "");
  }

  return lines.join("\n");
};

export const doctorCommand = (): Command =>
  new Command("doctor")
    .description("check node, providers, adapters and config")
    .argument("[path]", "workspace root", ".")
    .action(async (target: string) => {
      const report = await collectDoctorReport({
        root: path.resolve(process.cwd(), target),
        providers: builtinProviders,
        adapters: builtinAdapters,
      });

      process.stdout.write(renderDoctorReport(report));
      process.exitCode = report.exitCode;
    });
