import { z } from "zod";

export const UnitKindSchema = z.enum([
  "module",
  "class",
  "interface",
  "type",
  "function",
  "method",
  "property",
  "endpoint",
  "command",
  "config",
  "other",
]);
export type UnitKind = z.infer<typeof UnitKindSchema>;

export const SourceLocationSchema = z.object({
  /** Path relative to the workspace root. */
  file: z.string().min(1),
  startLine: z.number().int().nonnegative(),
  endLine: z.number().int().nonnegative(),
});
export type SourceLocation = z.infer<typeof SourceLocationSchema>;

export const ParamFactSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  optional: z.boolean().default(false),
  defaultValue: z.string().optional(),
});
export type ParamFact = z.infer<typeof ParamFactSchema>;

/**
 * Everything an adapter can state about a unit *without* an LLM.
 * Facts are deterministic: same source, same facts.
 */
export const FactsSchema = z.object({
  signature: z.string().optional(),
  visibility: z.enum(["public", "protected", "private"]).optional(),
  exported: z.boolean().default(false),
  async: z.boolean().default(false),
  deprecated: z.boolean().default(false),
  decorators: z.array(z.string()).default([]),
  params: z.array(ParamFactSchema).default([]),
  returns: z.string().optional(),
  throws: z.array(z.string()).default([]),
  /** Doc comment already present in the source, if any. */
  docComment: z.string().optional(),
  /** Adapter-specific extras (route method/path, DI tokens, ...). */
  extra: z.record(z.string(), z.unknown()).default({}),
});
export type Facts = z.infer<typeof FactsSchema>;

/** A documentable entity extracted from source code. */
export const UnitSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  kind: UnitKindSchema,
  name: z.string().min(1),
  /** Fully qualified name, e.g. "UsersController.findOne". */
  fqn: z.string().optional(),
  location: SourceLocationSchema,
  facts: FactsSchema,
  /** Content hash of the source slice, used for staleness checks. */
  hash: z.string().min(1),
  /** LLM-generated prose. Absent until `glosik generate` runs. */
  summary: z.string().optional(),
});
export type Unit = z.infer<typeof UnitSchema>;

export const RelationKindSchema = z.enum([
  "imports",
  "calls",
  "extends",
  "implements",
  "injects",
  "exposes",
  "references",
  "contains",
]);
export type RelationKind = z.infer<typeof RelationKindSchema>;

/** A directed edge between two units. */
export const RelationSchema = z.object({
  /** Source unit id. */
  from: z.string().min(1),
  /** Target unit id. */
  to: z.string().min(1),
  kind: RelationKindSchema,
  weight: z.number().optional(),
});
export type Relation = z.infer<typeof RelationSchema>;
