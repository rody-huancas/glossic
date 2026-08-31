import { describe, expect, it } from "vitest";
import { defineConfig, GlosikConfigSchema, MANIFEST_VERSION, ManifestSchema } from "./index.js";

describe("@glosik/schema", () => {
  it("applies config defaults", () => {
    const config = GlosikConfigSchema.parse({});
    expect(config.provider).toBe("claude-code");
    expect(config.output.format).toBe("markdown");
  });

  it("defineConfig is an identity helper", () => {
    const config = defineConfig({ provider: "anthropic" });
    expect(config).toEqual({ provider: "anthropic" });
  });

  it("parses an empty manifest", () => {
    const manifest = ManifestSchema.parse({
      version: MANIFEST_VERSION,
      generatedAt: "1970-01-01T00:00:00.000Z",
      workspace: { name: "demo", root: "/tmp/demo" },
    });
    expect(manifest.units).toEqual([]);
    expect(manifest.relations).toEqual([]);
  });
});
