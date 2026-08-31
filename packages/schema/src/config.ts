import { z } from "zod";

export const OutputFormatSchema = z.enum(["markdown", "json"]);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

export const OutputConfigSchema = z.object({
  dir: z.string().default("docs"),
  manifest: z.string().default("docs/glosik.manifest.json"),
  format: OutputFormatSchema.default("markdown"),
});
export type OutputConfig = z.infer<typeof OutputConfigSchema>;

export const GlosikConfigSchema = z.object({
  include: z.array(z.string()).default(["**/*"]),
  exclude: z.array(z.string()).default(["**/node_modules/**", "**/dist/**", "**/vendor/**"]),
  /** Adapter ids, resolved in order; the first match wins. */
  adapters: z.array(z.string()).default(["generic"]),
  /** Provider id used by `glosik generate`. */
  provider: z.string().default("claude-code"),
  model: z.string().optional(),
  output: OutputConfigSchema.default({
    dir: "docs",
    manifest: "docs/glosik.manifest.json",
    format: "markdown",
  }),
  concurrency: z.number().int().positive().default(4),
});

/** Fully resolved config (defaults applied). */
export type GlosikConfig = z.infer<typeof GlosikConfigSchema>;
/** What a user writes in `glosik.config.ts` — every field optional. */
export type GlosikUserConfig = z.input<typeof GlosikConfigSchema>;

/** Identity helper that gives `glosik.config.ts` full type inference. */
export const defineConfig = (config: GlosikUserConfig): GlosikUserConfig => config;
