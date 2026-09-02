import { afterEach, describe, expect, it } from "vitest";

import manifest from "../../../package.json" with { type: "json" };
import {
  DEFAULT_LANGUAGE,
  detectLanguage,
  LANGUAGES,
  languageName,
  resolveLanguage,
} from "../../language.js";
import { MIN_WIDE_COLUMNS, renderBanner, shouldDecorate, TAGLINE } from "../../ui/banner.js";
import { CLI_VERSION } from "../../version.js";

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI colour
const ANSI = /\[[0-9;]*m/g;

const strip = (value: string): string => value.replace(ANSI, "");

/** The banner as plain lines, colour codes and blank padding removed. */
const plainBanner = (options: Parameters<typeof renderBanner>[0] = {}): string[] =>
  strip(renderBanner(options))
    .split("\n")
    .filter((line) => line.trim() !== "");

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
    const { printBanner } = await import("../../ui/banner.js");
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
    const written = strip(await capture({ isTty: true }));

    expect(written).toContain(`v${manifest.version}`);
    expect(written).toMatch(/██████╗|╔═╗┬/);
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
});

describe("banner width", () => {
  it("renders the block letters plus a caption on a wide terminal", () => {
    const lines = plainBanner({ version: "1.2.3", columns: 100 });

    expect(lines).toHaveLength(7);
    expect(lines[0]).toContain("██████╗");
    expect(lines[6]?.trim()).toBe(`v1.2.3 · ${TAGLINE}`);
  });

  it("uses the block letters from 60 columns up", () => {
    for (const columns of [MIN_WIDE_COLUMNS, 80, 200]) {
      const lines = plainBanner({ columns });

      expect(lines).toHaveLength(7);
      expect(lines[0]).toContain("██████╗");
    }
  });

  it("falls back to the compact letters below 60 columns", () => {
    for (const columns of [MIN_WIDE_COLUMNS - 1, 40, 20]) {
      const lines = plainBanner({ columns });

      expect(lines).toHaveLength(4);
      expect(lines[0]).toContain("╔═╗┬");
      expect(lines[0]).not.toContain("██████╗");
    }
  });

  it("drops the tagline when the compact banner takes over", () => {
    expect(plainBanner({ columns: 40 }).join("\n")).not.toContain(TAGLINE);
    expect(plainBanner({ columns: 100 }).join("\n")).toContain(TAGLINE);
  });

  it("never draws wider than the terminal", () => {
    for (const columns of [20, 40, MIN_WIDE_COLUMNS, 100]) {
      for (const line of plainBanner({ columns })) {
        expect(line.length).toBeLessThanOrEqual(columns);
      }
    }
  });
});

describe("the version on show", () => {
  it("is the one in the CLI package.json", () => {
    expect(CLI_VERSION).toBe(manifest.version);
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("reaches the banner", () => {
    expect(plainBanner({ columns: 100 }).at(-1)).toContain(`v${manifest.version}`);
    expect(plainBanner({ columns: 40 }).at(-1)).toContain(`v${manifest.version}`);
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
    expect(languageName("ja")).toBe("ja");
  });
});

describe("resolveLanguage", () => {
  const all = {
    flag      : "fr",
    project   : "de",
    preference: "it",
    system    : "pt",
  };

  it("prefers the flag over everything", () => {
    expect(resolveLanguage(all)).toEqual({ language: "fr", origin: "flag" });
  });

  it("falls to the project config when there is no flag", () => {
    expect(resolveLanguage({ ...all, flag: undefined })).toEqual({
      language: "de",
      origin  : "project",
    });
  });

  it("falls to the saved preference when the project says nothing", () => {
    expect(resolveLanguage({ ...all, flag: undefined, project: undefined })).toEqual({
      language: "it",
      origin  : "preference",
    });
  });

  it("falls to the system locale when nothing was chosen", () => {
    expect(resolveLanguage({ system: "pt" })).toEqual({ language: "pt", origin: "system" });
  });

  it("falls to English when there is nothing at all", () => {
    expect(resolveLanguage({})).toEqual({ language: DEFAULT_LANGUAGE, origin: "default" });
  });

  it("walks the whole chain in order", () => {
    const order                                      = ["flag", "project", "preference", "system", "default"] as const;
    const values: Record<string, string | undefined> = { ...all };

    for (const origin of order) {
      const resolved = resolveLanguage(values);
      expect(resolved.origin).toBe(origin);
      if (origin !== "default") values[origin] = undefined;
    }
  });

  it("treats a blank value as absent", () => {
    expect(resolveLanguage({ flag: "   ", project: "es" })).toEqual({
      language: "es",
      origin  : "project",
    });
  });
});

describe("LANGUAGES", () => {
  it("offers the six the menu promises", () => {
    expect(LANGUAGES.map((entry) => entry.code)).toEqual(["en", "es", "pt", "fr", "de", "it"]);
  });

  it("names every one of them", () => {
    for (const entry of LANGUAGES) {
      expect(languageName(entry.code)).toBe(entry.name);
    }
  });
});
