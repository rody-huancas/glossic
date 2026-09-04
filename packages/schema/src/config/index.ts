import { z } from "zod";
import { DEFAULT_EXCLUDE, DEFAULT_EXCLUDE_FROM_CONTENT, DEFAULT_IGNORE_UNITS } from "./defaults.js";

export const OutputConfigSchema = z.object({
  dir     : z.string().default("docs"),
  manifest: z.string().default(".glossic/manifest.json"),
});

export type OutputConfig = z.infer<typeof OutputConfigSchema>;


export const GlossicConfigSchema = z.object({
  include : z.array(z.string()).default(["**/*"]),
  exclude : z.array(z.string()).default([...DEFAULT_EXCLUDE]),
  adapters: z.array(z.string()).default(["nestjs", "treesitter", "generic"]),

  ignoreUnits       : z.array(z.string()).default([...DEFAULT_IGNORE_UNITS]),
  excludeFromContent: z.array(z.string()).default([...DEFAULT_EXCLUDE_FROM_CONTENT]),

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
  warnAboveUnits   : z.number().int().nonnegative().default(30),
});


export type GlossicConfig     = z.infer<typeof GlossicConfigSchema>;
export type GlossicUserConfig = z.input<typeof GlossicConfigSchema>;

export const defineConfig = (config: GlossicUserConfig): GlossicUserConfig => config;

export type { AdditiveListKey } from "./defaults.js";
export type { ListOverride, ListOverrides } from "./lists.js";
export { applyListOverride, REMOVE_PREFIX } from "./lists.js";
export { ADDITIVE_LIST_KEYS, DEFAULT_EXCLUDE, DEFAULT_EXCLUDE_FROM_CONTENT, DEFAULT_IGNORE_UNITS, LIST_DEFAULTS } from "./defaults.js";
