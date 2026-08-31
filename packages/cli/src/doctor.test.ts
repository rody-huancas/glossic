import { createFakeProvider } from "@glosik/core";
import { describe, expect, it } from "vitest";

import { collectDoctorReport, renderDoctorReport } from "./commands/doctor.js";
import { builtinAdapters } from "./registries.js";

const exampleRoot = (name: string): string =>
  new URL(`../../../examples/${name}`, import.meta.url).pathname;

describe("glosik doctor", () => {
  it("exits 0 and names the provider it would use", async () => {
    const report = await collectDoctorReport({
      root: exampleRoot("nestjs-api"),
      providers: [
        createFakeProvider({ name: "claude-code", available: true }),
        createFakeProvider({ name: "anthropic", available: false }),
      ],
      adapters: builtinAdapters,
    });

    expect(report.exitCode).toBe(0);
    expect(report.selected).toBe("claude-code");
    expect(report.providers).toEqual([
      { name: "claude-code", available: true },
      { name: "anthropic", available: false },
    ]);
    expect(report.adapters).toEqual(["nestjs", "treesitter", "generic"]);
  });

  it("exits 1 and explains both options when nothing is available", async () => {
    const report = await collectDoctorReport({
      root: exampleRoot("nestjs-api"),
      providers: [
        createFakeProvider({ name: "claude-code", available: false }),
        createFakeProvider({ name: "anthropic", available: false }),
      ],
      adapters: builtinAdapters,
    });

    expect(report.exitCode).toBe(1);
    expect(report.selected).toBeUndefined();

    const rendered = renderDoctorReport(report);
    expect(rendered).toContain("claude.com/claude-code");
    expect(rendered).toContain("ANTHROPIC_API_KEY");
    expect(rendered).toContain("missing");
  });

  it("reports the node version and the missing config file", async () => {
    const report = await collectDoctorReport({
      root: exampleRoot("nestjs-api"),
      providers: [createFakeProvider({ name: "claude-code", available: true })],
      adapters: builtinAdapters,
    });

    expect(report.node).toBe(process.versions.node);
    expect(report.configFile).toBeUndefined();
    expect(renderDoctorReport(report)).toContain("glosik.config.ts not found");
  });
});
