import { z } from "zod";
import { GlosikConfigSchema } from "./config.js";
import { zFunction } from "./internal.js";
import { RelationSchema, UnitSchema } from "./unit.js";
import { type Project, ProjectSchema } from "./workspace.js";

/** Shared context handed to every adapter method. */
export const AdapterContextSchema = z.object({
  /** Absolute path to the workspace root. */
  root: z.string().min(1),
  config: GlosikConfigSchema,
});
export type AdapterContext = z.infer<typeof AdapterContextSchema>;

export const ExtractContextSchema = AdapterContextSchema.extend({
  project: ProjectSchema,
});
export type ExtractContext = z.infer<typeof ExtractContextSchema>;

export const ExtractResultSchema = z.object({
  units: z.array(UnitSchema).default([]),
  relations: z.array(RelationSchema).default([]),
});
export type ExtractResult = z.infer<typeof ExtractResultSchema>;

/**
 * Turns a folder into projects, units and relations. Purely static:
 * an adapter never talks to an LLM.
 */
export const AdapterSchema = z.object({
  /** Unique adapter id, e.g. "generic", "nestjs". */
  name: z.string().min(1),
  /** Can this adapter handle the workspace? */
  detect: zFunction<(ctx: AdapterContext) => Promise<boolean>>(),
  /** Find the projects this adapter is responsible for. */
  discover: zFunction<(ctx: AdapterContext) => Promise<Project[]>>(),
  /** Pull facts out of a single project. */
  extract: zFunction<(ctx: ExtractContext) => Promise<ExtractResult>>(),
});
export type Adapter = z.infer<typeof AdapterSchema>;
