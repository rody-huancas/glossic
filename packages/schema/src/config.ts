import { z } from "zod";

export const OutputFormatSchema = z.enum(["markdown", "json"]);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

export const OutputConfigSchema = z.object({
  dir: z.string().default("docs"),
  manifest: z.string().default(".glossic/manifest.json"),
  format: OutputFormatSchema.default("markdown"),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

export const GlossicConfigSchema = z.object({
  include: z.array(z.string()).default(["**/*"]),
  exclude: z.array(z.string()).default(["**/node_modules/**", "**/dist/**", "**/vendor/**"]),
  /** Adapter ids, resolved in order; the first match wins. */
  adapters: z.array(z.string()).default(["generic"]),
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
  output: OutputConfigSchema.default({
    dir: "docs",
    manifest: ".glossic/manifest.json",
    format: "markdown",
  }),
  concurrency: z.number().int().positive().default(3),
});

/** Fully resolved config (defaults applied). */
export type GlossicConfig = z.infer<typeof GlossicConfigSchema>;
/** What a user writes in `glossic.config.ts` — every field optional. */
export type GlossicUserConfig = z.input<typeof GlossicConfigSchema>;

/** Identity helper that gives `glossic.config.ts` full type inference. */
export const defineConfig = (config: GlossicUserConfig): GlossicUserConfig => config;
