import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CheckResult, GenerateResult, ScanResult } from "@glossic/core";
import { GlossicConfigSchema } from "@glossic/schema";
import { afterAll, describe, expect, it } from "vitest";
import type { DoctorReport } from "../../commands/doctor.js";
import { renderDoctorReport } from "../../commands/doctor.js";
import { resolveEffectiveConfig } from "../../config.js";
import type { MessageKey } from "../../i18n/index.js";
import { createTranslator, en, es, hasCatalogue, UI_LANGUAGES } from "../../i18n/index.js";
import { preferencesPath } from "../../preferences.js";
import { renderCheckReport, renderGenerateReport, renderScanReport } from "../../render/index.js";

const tempDirs: string[] = [];

const sandbox = async (preferences?: Record<string, unknown>) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-i18n-"));
  tempDirs.push(home);

  const location = { env: {}, platform: "linux" as const, homedir: home };

  if (preferences !== undefined) {
    // Written through the real path resolver: hand-building it once put the
    // file where nothing would ever read it.
    const target = preferencesPath(location);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(preferences), "utf8");
  }

  return location;
};

const project = async (config?: string): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "glossic-i18n-proj-"));
  tempDirs.push(root);

  await fs.writeFile(path.join(root, "package.json"), '{ "name": "demo" }', "utf8");
  if (config !== undefined) {
    await fs.writeFile(path.join(root, "glossic.config.ts"), config, "utf8");
  }
  return root;
};

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { force: true, recursive: true })));
});

describe("the catalogues", () => {
  it("offers exactly the languages it has strings for", () => {
    expect(UI_LANGUAGES).toEqual(["en", "es"]);
    expect(hasCatalogue("en")).toBe(true);
    expect(hasCatalogue("es")).toBe(true);
    expect(hasCatalogue("fr")).toBe(false);
  });

  it("translates every key English declares", () => {
    const missing = (Object.keys(en) as MessageKey[]).filter((key) => es[key] === undefined);
    expect(missing).toEqual([]);
  });

  it("declares no Spanish key that English does not have", () => {
    const extra = Object.keys(es).filter((key) => !(key in en));
    expect(extra).toEqual([]);
  });

  it("keeps the placeholders of every key it translates", () => {
    const placeholders = (value: string): string[] =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();

    for (const key of Object.keys(en) as MessageKey[]) {
      const translated = es[key];
      if (translated === undefined) continue;
      expect(placeholders(translated), key).toEqual(placeholders(en[key]));
    }
  });
});

describe("a missing key falls back rather than breaking", () => {
  it("returns the English string when Spanish does not have it", () => {
    // The catalogue is a plain object, so a gap is just an absent key.
    const partial = createTranslator("es");
    const gap     = "menu.question" as MessageKey;

    const saved = es[gap];
    try {
      delete es[gap];
      expect(createTranslator("es")(gap)).toBe(en[gap]);
    } finally {
      if (saved !== undefined) es[gap] = saved;
    }

    expect(partial("menu.exit")).toBe("Salir");
  });

  it("falls back wholesale for a language with no catalogue at all", () => {
    expect(createTranslator("fr")("menu.exit")).toBe(en["menu.exit"]);
  });

  it("leaves an unknown placeholder alone instead of printing undefined", () => {
    expect(createTranslator("en")("menu.hint.current", {})).toContain("{value}");
  });

  it("substitutes numbers as well as strings", () => {
    expect(createTranslator("en")("count.files", { count: 3 })).toBe("3 files");
  });
});

describe("the uiLang chain matches the lang chain", () => {
  it("takes the flag first", async () => {
    const { config, origins } = await resolveEffectiveConfig({
      root    : await project('export default { uiLang: "en" };\n'),
      flags   : { uiLang: "es" },
      location: await sandbox({ uiLang: "en" }),
    });

    expect(config.uiLang).toBe("es");
    expect(origins.uiLang).toBe("flag");
  });

  it("then the project config", async () => {
    const { config, origins } = await resolveEffectiveConfig({
      root    : await project('export default { uiLang: "es" };\n'),
      location: await sandbox({ uiLang: "en" }),
    });

    expect(config.uiLang).toBe("es");
    expect(origins.uiLang).toBe("project");
  });

  it("then the saved preference", async () => {
    const { config, origins } = await resolveEffectiveConfig({
      root    : await project(),
      location: await sandbox({ uiLang: "es" }),
    });

    expect(config.uiLang).toBe("es");
    expect(origins.uiLang).toBe("preference");
  });

  it("keeps the two languages independent", async () => {
    const { config } = await resolveEffectiveConfig({
      root    : await project(),
      location: await sandbox({ uiLang: "en", lang: "pt" }),
    });

    // An English menu documenting a codebase in Portuguese is a normal thing
    // to want, and the whole reason these are two settings.
    expect(config.uiLang).toBe("en");
    expect(config.lang).toBe("pt");
  });

  it("never picks an interface language it has no catalogue for", async () => {
    const { config } = await resolveEffectiveConfig({
      root    : await project(),
      location: await sandbox({ lang: "fr" }),
    });

    expect(UI_LANGUAGES).toContain(config.uiLang);
  });
});

describe("every visible surface is translated", () => {
  const t = { en: createTranslator("en"), es: createTranslator("es") };

  const scanResult = {
    manifest: {
      version    : "1",
      generatedAt: "",
      workspace: {
        name      : "demo",
        root      : "/tmp/demo",
        isMonorepo: true,
        tool      : "pnpm",
        projects  : [{ id: "root", name: "demo", rootDir: "." }],
      },
      units: [
        {
          id       : "root:src",
          projectId: "root",
          kind     : "directory",
          name     : "src",
          path     : "src",
          facts: {
            base: {
              files       : [{ path: "src/a.ts", language: "typescript", bytes: 1 }],
              testFiles   : [],
              ignoredFiles: [],
              languages   : [{ language: "typescript", count: 1 }],
              roleHint    : null,
            },
            producedBy: ["generic"],
          },
          hash: "h",
        },
      ],
      relations: [],
    },
  } as unknown as ScanResult;

  const generateResult = {
    manifest: scanResult.manifest,
    written : ["src.md"],
    plan: [
      {
        unitId         : "root:src",
        docPath        : "src.md",
        files          : 1,
        estimatedTokens: 500,
        reason         : "new",
        regenerate     : true,
      },
    ],
    failures       : [],
    warnings       : [],
    filteredOut    : [],
    skipped        : [],
    aborted        : undefined,
    estimatedTokens: 500,
    savedTokens    : 100,
    generated      : 1,
    fromCache      : 0,
    dryRun         : false,
  } as unknown as GenerateResult;

  /** The same run, stopped by a spent quota with two units never sent. */
  const stoppedResult = {
    ...generateResult,
    failures: [
      {
        unitId: "root:src",
        reason: "Claude AI usage limit reached",
        code  : "quota",
        detail: undefined,
      },
    ],
    skipped: ["root:lib", "root:test"],
    aborted: {
      unitId   : "root:src",
      code     : "quota",
      reason   : "Claude AI usage limit reached",
      remaining: 2,
    },
  } as unknown as GenerateResult;

  const checkResult = {
    outDir  : "/tmp/demo/docs",
    upToDate: [],
    missing: [
      { unitId: "root:src", docPath: "src.md", expectedHash: "h", documentedHash: undefined },
    ],
    stale   : [],
    orphaned: ["old.md"],
    ok      : false,
  } as unknown as CheckResult;

  const doctorReport: DoctorReport = {
    node         : "22.0.0",
    platform     : "linux-x64",
    providers    : [{ name: "claude-code", available: false }],
    selected     : undefined,
    adapters     : ["generic"],
    projectConfig: { status: "missing" },
    config       : [{ key: "lang", value: "es", origin: "default" }],
    lang         : "es",
    uiLang       : "en",
    exitCode     : 1,
  };

  it("renders the scan report in both languages", () => {
    const english = renderScanReport(scanResult, t.en);
    const spanish = renderScanReport(scanResult, t.es);

    expect(english).toContain("pnpm monorepo");
    expect(spanish).toContain("monorepo pnpm");
    expect(spanish).toContain("lenguajes:");
    expect(spanish).not.toContain("languages:");
  });

  it("renders the generate report in both languages", () => {
    const context = { outDir: "/tmp/demo/docs", cwd: "/tmp/demo", provider: "claude-code" };
    const spanish = renderGenerateReport(generateResult, { ...context, t: t.es });

    expect(spanish).toContain("proveedor:");
    expect(spanish).toContain("generadas");
    expect(spanish).toContain("tokens de entrada");
    expect(spanish).not.toContain("from cache");
  });

  it("says in both languages that a run stopped and what it left behind", () => {
    const context = { outDir: "/tmp/demo/docs", cwd: "/tmp/demo", provider: "claude-code" };

    const english = renderGenerateReport(stoppedResult, { ...context, t: t.en });
    const spanish = renderGenerateReport(stoppedResult, { ...context, t: t.es });

    expect(english).toContain("2 not attempted");
    expect(english).toContain("stopped on root:src [quota] — 2 units were never sent");
    expect(english).toContain("run the same command again");

    expect(spanish).toContain("2 sin intentar");
    expect(spanish).toContain("detenido en root:src [quota]");
    expect(spanish).not.toContain("not attempted");
    expect(spanish).not.toContain("never sent");
  });

  it("renders the check report in both languages", () => {
    const spanish = renderCheckReport(checkResult, { cwd: "/tmp/demo", target: ".", t: t.es });

    expect(spanish).toContain("desactualizada");
    expect(spanish).toContain("huérfana");
    expect(spanish).not.toContain("out of date");
  });

  it("renders the doctor report in both languages", () => {
    const spanish = renderDoctorReport(doctorReport, t.es);

    expect(spanish).toContain("proveedores");
    expect(spanish).toContain("configuración efectiva");
    expect(spanish).toContain("No hay ningún proveedor");
    expect(spanish).not.toContain("effective configuration");
  });

  it("leaves no English wording in the Spanish renders", () => {
    const spanish = [
      renderScanReport(scanResult, t.es),
      renderGenerateReport(generateResult, {
        outDir  : "/tmp/demo/docs",
        cwd     : "/tmp/demo",
        provider: "claude-code",
        t       : t.es,
      }),
      renderCheckReport(checkResult, { cwd: "/tmp/demo", target: ".", t: t.es }),
      renderDoctorReport(doctorReport, t.es),
    ].join("\n");

    // Any of these surviving means a string was built inline instead of looked up.
    for (const wording of [
      "single project",
      "no source files",
      "from cache",
      "input tokens",
      "files written",
      "up to date",
      "would be used",
      "Pick one",
    ]) {
      expect(spanish, wording).not.toContain(wording);
    }
  });
});

describe("without a terminal none of this applies", () => {
  it("still resolves an interface language, it just never draws a menu", async () => {
    const { config } = await resolveEffectiveConfig({
      root    : await project(),
      location: await sandbox({ uiLang: "es" }),
    });

    // The reports honour it; the menu is gated separately by shouldDecorate.
    expect(config.uiLang).toBe("es");
    expect(GlossicConfigSchema.parse({}).uiLang).toBe("en");
  });
});
