import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_LANGUAGE, detectLanguage, languageName } from "./language.js";
import { renderBanner, shouldDecorate } from "./ui/banner.js";

describe("shouldDecorate", () => {
  it("draws on a terminal", () => {
    expect(shouldDecorate({ isTty: true })).toBe(true);
  });

  it("draws nothing without a terminal", () => {
    expect(shouldDecorate({ isTty: false })).toBe(false);
  });

  it("is suppressed by --json", () => {
    expect(shouldDecorate({ isTty: true, json: true })).toBe(false);
  });

  it("is suppressed by --quiet", () => {
    expect(shouldDecorate({ isTty: true, quiet: true })).toBe(false);
  });

  it("stays off without a terminal even when nothing suppresses it", () => {
    expect(shouldDecorate({ isTty: false, json: false, quiet: false })).toBe(false);
  });
});

describe("printBanner", () => {
  const original = process.stdout.isTTY;

  afterEach(() => {
    process.stdout.isTTY = original;
  });

  const capture = async (options: Parameters<typeof shouldDecorate>[0]): Promise<string> => {
    const { printBanner } = await import("./ui/banner.js");
    let written = "";
    const write = process.stdout.write.bind(process.stdout);

    process.stdout.write = ((chunk: string) => {
      written += chunk;
      return true;
    }) as typeof process.stdout.write;

    try {
      printBanner(options);
    } finally {
      process.stdout.write = write;
    }

    return written;
  };

  it("prints the name and the version on a terminal", async () => {
    const written = await capture({ isTty: true });

    expect(written).toContain("v");
    // The block letters, stripped of colour.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
    expect(written.replace(/\[[0-9;]*m/g, "")).toContain("╔═╗┬");
  });

  it("prints nothing without a terminal", async () => {
    expect(await capture({ isTty: false })).toBe("");
  });

  it("prints nothing with --json", async () => {
    expect(await capture({ isTty: true, json: true })).toBe("");
  });

  it("prints nothing with --quiet", async () => {
    expect(await capture({ isTty: true, quiet: true })).toBe("");
  });

  it("renders three lines of letters plus the version", () => {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
    const plain = renderBanner("1.2.3").replace(/\[[0-9;]*m/g, "");
    const lines = plain.split("\n").filter((line) => line.trim() !== "");

    expect(lines).toHaveLength(4);
    expect(lines[3]?.trim()).toBe("v1.2.3");
  });
});

describe("detectLanguage", () => {
  it("reads a POSIX locale", () => {
    expect(detectLanguage({ env: { LANG: "es_PE.UTF-8" } })).toBe("es");
    expect(detectLanguage({ env: { LC_ALL: "fr_FR.UTF-8" } })).toBe("fr");
  });

  it("prefers LC_ALL over LANG", () => {
    expect(detectLanguage({ env: { LC_ALL: "de_DE.UTF-8", LANG: "es_PE.UTF-8" } })).toBe("de");
  });

  it("falls back to the runtime locale", () => {
    expect(detectLanguage({ env: {}, locale: "pt-BR" })).toBe("pt");
  });

  it("falls back to English with no locale at all", () => {
    expect(detectLanguage({ env: {}, locale: undefined })).toBe(DEFAULT_LANGUAGE);
    expect(DEFAULT_LANGUAGE).toBe("en");
  });

  it("ignores the C and POSIX locales, which name no language", () => {
    expect(detectLanguage({ env: { LANG: "C" }, locale: undefined })).toBe("en");
    expect(detectLanguage({ env: { LC_ALL: "POSIX" }, locale: undefined })).toBe("en");
  });

  it("ignores a value that is not a language code", () => {
    expect(detectLanguage({ env: { LANG: "12345" }, locale: undefined })).toBe("en");
  });

  it("names the languages it offers", () => {
    expect(languageName("es")).toBe("Spanish");
    expect(languageName("en")).toBe("English");
    expect(languageName("pt")).toBe("pt");
  });
});
