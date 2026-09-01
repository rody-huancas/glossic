import { z } from "zod";

export const OutputConfigSchema = z.object({
  dir     : z.string().default("docs"),
  manifest: z.string().default(".glossic/manifest.json"),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;


export const GlossicConfigSchema = z.object({
  include    : z.array(z.string()).default(["**/*"]),
  exclude    : z.array(z.string()).default(["**/node_modules/**", "**/dist/**", "**/vendor/**"]),
  adapters   : z.array(z.string()).default(["nestjs", "treesitter", "generic"]),
  ignoreUnits: z
    .array(z.string())
    .default([
      "*.config.ts",
      "*.config.mts",
      "*.config.cts",
      "*.config.js",
      "*.config.mjs",
      "*.config.cjs",
      "*.config.json",
      "tsconfig*.json",
      "package.json",
      ".*",
      "**/migrations/**",
      "**/migration/**",
      "**/seeders/**",
      "**/seeds/**",
      "**/__generated__/**",
      "**/generated/**",
      "**/*.generated.*",
    ]),

  excludeFromContent: z
    .array(z.string())
    .default(["**/*.test.*", "**/*.spec.*", "**/__tests__/**"]),

  mergeChildrenInto: z.number().int().positive().default(25),
  minUnitFiles     : z.number().int().positive().default(3),
  maxUnitFiles     : z.number().int().positive().default(10),
  provider         : z.string().optional(),
  model            : z.string().optional(),
  lang             : z.string().default("en"),
  uiLang           : z.enum(["en", "es"]).default("en"),
  temperature      : z.number().min(0).max(2).optional(),
  output           : OutputConfigSchema.default({ dir: "docs", manifest: ".glossic/manifest.json" }),
  concurrency      : z.number().int().positive().default(3),
  timeoutMs        : z.number().int().positive().default(300_000),
});


export type GlossicConfig     = z.infer<typeof GlossicConfigSchema>;
export type GlossicUserConfig = z.input<typeof GlossicConfigSchema>;

export const defineConfig = (config: GlossicUserConfig): GlossicUserConfig => config;
