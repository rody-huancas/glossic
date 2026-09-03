import type { GenerateResult, PlanReview } from "@glossic/core";
import { describe, expect, it } from "vitest";

import { renderEjectReport } from "../commands/eject/index.js";
import { createTranslator, en, es } from "../i18n/index.js";
import type { MessageKey } from "../i18n/index.js";
import { formatTokens, renderGenerateReport, renderPlanIntro } from "../render/index.js";

const t = { en: createTranslator("en"), es: createTranslator("es") };

/** Everything counted exactly once, which is where a hardcoded plural shows. */
const oneOfEverything = {
  manifest: {},
  written : ["src.md"],
  plan: [
    {
      unitId         : "root:src",
      docPath        : "src.md",
      files          : 1,
      estimatedTokens: 400,
      reason         : "new",
      regenerate     : true,
    },
  ],
  failures: [{ unitId: "root:lib", reason: "boom", code: "quota", detail: undefined }],
  warnings: [{ unitId: "root:src", dropped: 1, excerpt: "x" }],
  filteredOut    : ["root:web"],
  skipped        : ["root:api"],
  aborted        : { unitId: "root:lib", code: "quota", reason: "boom", remaining: 1 },
  estimatedTokens: 400,
  savedTokens    : 0,
  generated      : 1,
  fromCache      : 1,
  dryRun         : false,
} as unknown as GenerateResult;

const context = { outDir: "/demo/docs", cwd: "/demo", provider: "claude-code" };

const review = (over: Partial<PlanReview> = {}): PlanReview => ({
  pending        : 1,
  cached         : 1,
  estimatedTokens: 237_000,
  projects       : [],
  ...over,
});

describe("the tilde that says a token count is approximate", () => {
  it("comes from formatTokens and is never doubled", () => {
    expect(formatTokens(237_000)).toBe("~237k");
    expect(formatTokens(400)).toBe("400");
    expect(formatTokens(1000)).toBe("~1k");
  });

  it("is in no catalogue string, so nothing can print a second one", () => {
    // The templates take an already formatted count. One carrying its own "~"
    // is what produced "~~237k".
    for (const [key, value] of Object.entries({ ...en, ...es })) {
      expect(value, key).not.toContain("~");
    }
  });

  it("appears once in everything the run prints", () => {
    const printed = [
      renderPlanIntro(review(), 0, t.en),
      renderPlanIntro(review(), 0, t.es),
      renderGenerateReport(oneOfEverything, { ...context, t: t.en }),
      renderGenerateReport(oneOfEverything, { ...context, t: t.es }),
    ].join("\n");

    expect(printed).toContain("~237k");
    expect(printed).not.toContain("~~");
  });
});

describe("the catalogue's counted messages", () => {
  const bases = (catalogue: Record<string, string>, suffix: string): string[] =>
    Object.keys(catalogue)
      .filter((key) => key.endsWith(suffix))
      .map((key) => key.slice(0, -suffix.length))
      .sort();

  it("declares both forms of every one of them, in both languages", () => {
    expect(bases(en, ".one")).toEqual(bases(en, ".many"));
    expect(bases(es, ".one")).toEqual(bases(es, ".many"));
    expect(bases(es, ".one")).toEqual(bases(en, ".one"));
  });

  it("has a singular that is not just the plural again", () => {
    // Spanish agrees the whole clause, so a pair that is identical in both
    // languages is a pair somebody forgot to translate.
    const identical = bases(es, ".one").filter(
      (base) =>
        es[`${base}.one` as MessageKey] === es[`${base}.many` as MessageKey] &&
        en[`${base}.one` as MessageKey] === en[`${base}.many` as MessageKey],
    );

    // "from cache" and "desde cache" are the only wording that inflects in
    // neither language; every other pair earns its two strings somewhere.
    expect(identical).toEqual(["count.cached"]);
  });

  it("leaves no counter behind: a raw {count} always comes in both forms", () => {
    // The two kinds of slot are named apart on purpose. `{count}` is a bare
    // number the message has to word itself, so it needs both forms; `{units}`
    // and friends are handed an already counted phrase and need one.
    const singleForm = Object.entries(en)
      .filter(([key]) => !key.endsWith(".one") && !key.endsWith(".many"))
      .filter(([, value]) => value.includes("{count}"))
      .map(([key]) => key);

    // `generate.skipped` counts too, but "not attempted" and "sin intentar"
    // read the same either way, so it needs no second form.
    expect(singleForm).toEqual(["generate.skipped"]);
  });
});

describe("a count of one", () => {
  it("reads as a singular through the whole English report", () => {
    const report = renderGenerateReport(oneOfEverything, { ...context, t: t.en });

    expect(report).toContain("1 generated, 1 from cache, 1 failed");
    expect(report).toContain("1 filtered out");
    expect(report).toContain("1 file written to");
    expect(report).toContain("dropped 1 character before");
    expect(report).toContain("1 unit was never sent");
    expect(report).not.toContain("1 files");
    expect(report).not.toContain("1 units");
    expect(report).not.toContain("1 characters");
  });

  it("reads as a singular through the whole Spanish report", () => {
    const report = renderGenerateReport(oneOfEverything, { ...context, t: t.es });

    expect(report).toContain("1 generada, 1 desde cache, 1 fallida");
    expect(report).toContain("1 filtrada");
    expect(report).toContain("1 archivo escrito en");
    expect(report).toContain("se descartó 1 carácter");
    expect(report).toContain("1 unit no se envió");
    expect(report).not.toContain("1 archivos");
    expect(report).not.toContain("1 fallidas");
    expect(report).not.toContain("1 generadas");
  });

  it("reads as a singular in the line that says what is left to do", () => {
    expect(renderPlanIntro(review(), 99, t.en)).toContain("1 unit pending, 1 already generated");
    expect(renderPlanIntro(review(), 99, t.es)).toContain("1 unit pendiente, 1 ya generada");
  });

  it("reads as a singular in the eject report", () => {
    const result = {
      docsDir : "/demo/docs",
      outDir  : "/demo/docs-site",
      title   : "demo",
      accent  : "#0d9488",
      pages   : ["src.md"],
      skipped : ["root:lib"],
      template: "starlight",
    };

    expect(renderEjectReport(result, "/demo", t.en)).toContain("1 page written to");
    expect(renderEjectReport(result, "/demo", t.en)).toContain("1 unit has no page yet");

    expect(renderEjectReport(result, "/demo", t.es)).toContain("1 página escrita en");
    expect(renderEjectReport(result, "/demo", t.es)).toContain("1 unit todavía no tiene página");
  });
});

describe("a count of more than one", () => {
  it("still reads as a plural, in both languages", () => {
    const many = {
      ...oneOfEverything,
      generated  : 3,
      fromCache  : 2,
      failures   : [...Array(2)].map((_, index) => ({
        unitId: `root:${index}`,
        reason: "boom",
        code  : "api",
        detail: undefined,
      })),
      filteredOut: ["a", "b"],
      written    : ["a.md", "b.md"],
      warnings   : [{ unitId: "root:src", dropped: 12, excerpt: "x" }],
      aborted    : undefined,
    } as unknown as GenerateResult;

    expect(renderGenerateReport(many, { ...context, t: t.en })).toContain(
      "3 generated, 2 from cache, 2 failed",
    );
    expect(renderGenerateReport(many, { ...context, t: t.en })).toContain("2 files written to");
    expect(renderGenerateReport(many, { ...context, t: t.es })).toContain(
      "3 generadas, 2 desde cache, 2 fallidas",
    );
    expect(renderGenerateReport(many, { ...context, t: t.es })).toContain("2 archivos escritos en");
    expect(renderPlanIntro(review({ pending: 5, cached: 4 }), 99, t.es)).toContain(
      "5 units pendientes, 4 ya generadas",
    );
  });
});
