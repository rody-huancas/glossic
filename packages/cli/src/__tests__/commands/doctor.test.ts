import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createFakeProvider } from "@glossic/core";
import { afterAll, describe, expect, it } from "vitest";

import { collectDoctorReport, renderDoctorReport, renderDoctorSummary } from "../../commands/doctor.js";
import { createTranslator } from "../../i18n/index.js";
import { builtinAdapters } from "../../registries.js";

const exampleRoot = (name: string): string =>
  fileURLToPath(new URL(`../../../../../examples/${name}`, import.meta.url));

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

    const rendered = renderDoctorReport(report, createTranslator("en"));
    expect(rendered).toContain("claude.com/claude-code");
    expect(rendered).toContain("ANTHROPIC_API_KEY");
    expect(rendered).toContain("missing");
  });

  it("reports the node version and the missing config file", async () => {
    const report = await collectDoctorReport({
      root     : exampleRoot("nestjs-api"),
      providers: [createFakeProvider({ name: "claude-code", available: true })],
      adapters : builtinAdapters,
    });

    expect(report.node).toBe(process.versions.node);
    expect(report.projectConfig).toEqual({ status: "missing" });
    expect(renderDoctorReport(report, createTranslator("en"))).toContain(
      "glossic.config.ts not found",
    );
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
      adapters : builtinAdapters,
    });

  it("lists every option with its origin", async () => {
    const entries = (await report(await project())).config;
    const keys    = entries.map((entry) => entry.key);

    for (const key of ["adapters", "lang", "maxUnitFiles", "concurrency", "timeoutMs", "output"]) {
      expect(keys).toContain(key);
    }
    expect(entries.every((entry) => entry.origin !== "")).toBe(true);
  });

  it("says which values the project config decided", async () => {
    const root   = await project('export default { maxUnitFiles: 4, lang: "pt" };\n');
    const result = await report(root);

    const byKey = Object.fromEntries(result.config.map((entry) => [entry.key, entry]));

    expect(byKey.maxUnitFiles).toMatchObject({ value: "4", origin: "project" });
    expect(byKey.lang).toMatchObject({ value: "pt", origin: "project" });
    expect(byKey.minUnitFiles).toMatchObject({ origin: "default" });
    expect(result.projectConfig).toMatchObject({
      status: "loaded",
      file  : expect.stringContaining("glossic.config.ts"),
    });
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

  it("prints every additive list one pattern per line, marked", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-doctor-lists-"));
    tempDirs.push(root);

    await fs.writeFile(path.join(root, "package.json"), '{ "name": "demo" }', "utf8");
    await fs.writeFile(
      path.join(root, "glossic.config.ts"),
      'export default { exclude: ["-**/out/**", "**/legacy/**"] };\n',
      "utf8",
    );

    const report = await collectDoctorReport({
      root,
      providers: [createFakeProvider({ name: "claude-code", available: true })],
      adapters : builtinAdapters,
    });

    const exclude = report.lists.find((list) => list.key === "exclude");

    expect(exclude?.rows).toContainEqual({ mark: "removed", pattern: "**/out/**" });
    expect(exclude?.rows).toContainEqual({ mark: "added", pattern: "**/legacy/**" });
    expect(exclude?.rows).toContainEqual({ mark: "default", pattern: "**/dist/**" });

    // Every default is still accounted for, kept or dropped, plus the addition.
    expect(exclude?.rows.filter((row) => row.mark === "added")).toHaveLength(1);
    expect(report.lists.map((list) => list.key)).toEqual([
      "exclude",
      "ignoreUnits",
      "excludeFromContent",
    ]);

    // The table counts them rather than printing thirty globs on one line.
    const row = report.config.find((entry) => entry.key === "exclude");

    expect(row?.value).toMatch(/^\d+ \(\+1, -1\)$/);
    expect(row?.origin).toBe("project");

    const rendered = renderDoctorReport(report, createTranslator("en"));

    expect(rendered).toContain("additive lists");
    expect(rendered).toContain("removed  **/out/**");
    expect(rendered).toContain("added    **/legacy/**");
  });

  it("renders the block so a human can read it", async () => {
    const rendered = renderDoctorReport(await report(await project()), createTranslator("en"));

    expect(rendered).toContain("effective configuration");
    expect(rendered).toMatch(/maxUnitFiles\s+default\s+10/);
  });

  describe("the config line tells the four states apart", () => {
    const configLine = (rendered: string): string =>
      rendered.split("\n").find((line) => line.trimStart().startsWith("config")) ?? "";

    it("says none when the project has no config file", async () => {
      const rendered = renderDoctorReport(await report(await project()), createTranslator("en"));

      expect(configLine(rendered)).toContain("none (glossic.config.ts not found)");
    });

    it("names the file and the reason when the config will not load", async () => {
      const root = await project(
        'import { defineConfig } from "@glossic/not-a-real-package";\n' +
          'export default defineConfig({ lang: "pt" });\n',
      );

      const result   = await report(root);
      const rendered = renderDoctorReport(result, createTranslator("en"));

      expect(result.projectConfig).toMatchObject({ status: "failed" });
      expect(configLine(rendered)).toContain("failed to load");
      expect(configLine(rendered)).toContain("@glossic/not-a-real-package");
      expect(configLine(rendered)).toContain("glossic.config.ts");
    });

    it("says a config that sets nothing sets nothing", async () => {
      const root     = await project("export default {\n  // lang: 'pt',\n};\n");
      const rendered = renderDoctorReport(await report(root), createTranslator("en"));

      expect(configLine(rendered)).toContain("no options set");
      expect(configLine(rendered)).toContain("glossic.config.ts");
    });

    it("prints the path alone when the config decides something", async () => {
      const root     = await project('export default { lang: "pt" };\n');
      const rendered = renderDoctorReport(await report(root), createTranslator("en"));

      expect(configLine(rendered)).toContain("glossic.config.ts");
      expect(configLine(rendered)).not.toContain("(");
    });

    it("falls back to the defaults instead of breaking when the config will not load", async () => {
      const root   = await project('import "@glossic/not-a-real-package";\nexport default {};\n');
      const result = await report(root);

      const byKey = Object.fromEntries(result.config.map((entry) => [entry.key, entry]));

      expect(result.exitCode).toBe(0);
      expect(byKey.maxUnitFiles).toMatchObject({ value: "10", origin: "default" });
    });

    it("warns in the menu summary, where there is no config line to read", async () => {
      const root = await project('import "@glossic/not-a-real-package";\nexport default {};\n');

      const summary = renderDoctorSummary(await report(root), createTranslator("en"));

      expect(summary).toContain("running on the defaults");
      expect(summary).toContain("@glossic/not-a-real-package");
    });
  });
});
