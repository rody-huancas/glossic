import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createFakeProvider } from "@glossic/core";
import { afterAll, describe, expect, it } from "vitest";

import { collectDoctorReport, renderDoctorReport } from "./commands/doctor.js";
import { builtinAdapters } from "./registries.js";

const exampleRoot = (name: string): string =>
  fileURLToPath(new URL(`../../../examples/${name}`, import.meta.url));

describe("glossic doctor", () => {
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
    expect(renderDoctorReport(report)).toContain("glossic.config.ts not found");
  });
});

describe("the effective configuration", () => {
  const tempDirs: string[] = [];

  afterAll(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
  });

  const project = async (config?: string): Promise<string> => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-doctor-"));
    tempDirs.push(root);

    await fs.writeFile(path.join(root, "package.json"), '{ "name": "doc-demo" }', "utf8");
    if (config !== undefined) {
      await fs.writeFile(path.join(root, "glossic.config.ts"), config, "utf8");
    }
    return root;
  };

  const report = async (root: string) =>
    collectDoctorReport({
      root,
      providers: [createFakeProvider({ name: "claude-code", available: true })],
      adapters: builtinAdapters,
    });

  it("lists every option with its origin", async () => {
    const entries = (await report(await project())).config;
    const keys = entries.map((entry) => entry.key);

    for (const key of ["adapters", "lang", "maxUnitFiles", "concurrency", "timeoutMs", "output"]) {
      expect(keys).toContain(key);
    }
    expect(entries.every((entry) => entry.origin !== "")).toBe(true);
  });

  it("says which values the project config decided", async () => {
    const root = await project('export default { maxUnitFiles: 4, lang: "pt" };\n');
    const result = await report(root);

    const byKey = Object.fromEntries(result.config.map((entry) => [entry.key, entry]));

    expect(byKey.maxUnitFiles).toMatchObject({ value: "4", origin: "project" });
    expect(byKey.lang).toMatchObject({ value: "pt", origin: "project" });
    expect(byKey.minUnitFiles).toMatchObject({ origin: "default" });
    expect(result.configFile).toContain("glossic.config.ts");
  });

  it("does not let a partial config claim the keys it never set", async () => {
    const root = await project("export default { maxUnitFiles: 4 };\n");
    const byKey = Object.fromEntries(
      (await report(root)).config.map((entry) => [entry.key, entry]),
    );

    expect(byKey.maxUnitFiles?.origin).toBe("project");
    // lang comes from the system locale, folded in as a preference.
    expect(byKey.lang?.origin).not.toBe("project");
  });

  it("renders the block so a human can read it", async () => {
    const rendered = renderDoctorReport(await report(await project()));

    expect(rendered).toContain("effective configuration");
    expect(rendered).toMatch(/maxUnitFiles\s+default\s+10/);
  });
});
