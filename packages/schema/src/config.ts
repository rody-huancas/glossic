import { z } from "zod";

export const OutputConfigSchema = z.object({
  /** Where `generate` writes, relative to the workspace root. */
  dir: z.string().default("docs"),
  /** Where `scan` writes, relative to the workspace root. */
  manifest: z.string().default(".glossic/manifest.json"),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

export const GlossicConfigSchema = z.object({
  /** Globs an adapter walks, relative to each project root. */
  include: z.array(z.string()).default(["**/*"]),
  /** Globs never walked into, on top of the adapter's own hard ignores. */
  exclude: z.array(z.string()).default(["**/node_modules/**", "**/dist/**", "**/vendor/**"]),
  /**
   * Adapter ids in priority order; the first whose `detect` passes wins.
   * An adapter left off this list is never tried.
   */
  adapters: z.array(z.string()).default(["nestjs", "treesitter", "generic"]),

  /**
   * Files with no documentable content. A unit whose files all match is
   * dropped: it never reaches the manifest, the plan or the provider.
   * Matched against the path relative to the project root.
   *
   * Deliberately anchored to the project root rather than globbed with `**`:
   * `src/config/app.config.ts` is application code, not build configuration.
   */
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

  /**
   * Files that count towards the unit hash but are never sent as content.
   * Matched against the path relative to the project root.
   */
  excludeFromContent: z
    .array(z.string())
    .default(["**/*.test.*", "**/*.spec.*", "**/__tests__/**"]),

  /**
   * A directory absorbs every descendant directory when the combined number
   * of documentable files stays at or below this. This is what turns a NestJS
   * module and its dto/entities/strategies folders into a single unit.
   */
  mergeChildrenInto: z.number().int().positive().default(25),

  /** A unit below this many documentable files absorbs its child units. */
  minUnitFiles: z.number().int().positive().default(3),

  /** A unit above this many documentable files is split by filename root. */
  maxUnitFiles: z.number().int().positive().default(10),
  /** Provider id used by `glossic generate`. Empty means "auto-detect". */
  provider: z.string().optional(),
  model: z.string().optional(),
  /** ISO 639-1 code the documentation is written in. */
  lang: z.string().default("en"),
  /**
   * Left unset on purpose: the recent Claude models reject sampling parameters
   * with a 400, so each provider decides whether to forward it.
   */
  temperature: z.number().min(0).max(2).optional(),
  output: OutputConfigSchema.default({ dir: "docs", manifest: ".glossic/manifest.json" }),

  /** Completions in flight at once. */
  concurrency: z.number().int().positive().default(3),

  /**
   * Milliseconds before a single completion is abandoned. The claude-code CLI
   * boots a whole agent before answering, which is why the default is generous.
   */
  timeoutMs: z.number().int().positive().default(300_000),
});

/** Fully resolved config (defaults applied). */
export type GlossicConfig = z.infer<typeof GlossicConfigSchema>;
/** What a user writes in `glossic.config.ts` — every field optional. */
export type GlossicUserConfig = z.input<typeof GlossicConfigSchema>;

/** Identity helper that gives `glossic.config.ts` full type inference. */
export const defineConfig = (config: GlossicUserConfig): GlossicUserConfig => config;
