import { describe, expect, it } from "vitest";

import { defineConfig, GlosikConfigSchema, MANIFEST_VERSION, ManifestSchema } from "./index.js";

describe("@glosik/schema", () => {
  it("applies config defaults", () => {
    const config = GlosikConfigSchema.parse({});

    // No provider means "auto-detect": claude-code first, then anthropic.
    expect(config.provider).toBeUndefined();
    expect(config.output.format).toBe("markdown");
    expect(config.output.manifest).toBe(".glosik/manifest.json");
    expect(config.lang).toBe("en");
    // Unset on purpose: recent Claude models reject sampling parameters.
    expect(config.temperature).toBeUndefined();
    expect(config.concurrency).toBe(3);
  });

  it("defineConfig is an identity helper", () => {
    const config = defineConfig({ provider: "anthropic" });
    expect(config).toEqual({ provider: "anthropic" });
  });

  it("parses an empty manifest", () => {
    const manifest = ManifestSchema.parse({
      version: MANIFEST_VERSION,
      generatedAt: "1970-01-01T00:00:00.000Z",
      workspace: {
        name: "demo",
        root: "/tmp/demo",
        isMonorepo: false,
        tool: "none",
        projects: [{ id: "root", name: "demo", rootDir: "." }],
      },
    });
    expect(manifest.units).toEqual([]);
    expect(manifest.relations).toEqual([]);
  });

  it("rejects an unknown role hint", () => {
    const facts = { files: [], languages: [], roleHint: "wat" };
    expect(() => ManifestSchema.shape.units.parse([{ facts }])).toThrow();
  });
});
