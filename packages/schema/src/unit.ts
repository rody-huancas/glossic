import { z } from "zod";

export const UnitKindSchema = z.enum(["directory", "module", "file"]);
export type UnitKind = z.infer<typeof UnitKindSchema>;

/** Folder-name heuristics recognized by the adapters. */
export const RoleHintSchema = z.enum([
  "components",
  "config",
  "controllers",
  "dtos",
  "entities",
  "hooks",
  "middleware",
  "models",
  "routes",
  "services",
  "tests",
  "utils",
]);
export type RoleHint = z.infer<typeof RoleHintSchema>;

export const FileFactSchema = z.object({
  /** Posix path relative to the workspace root. */
  path: z.string().min(1),
  /** Inferred from the file extension. */
  language: z.string().min(1),
  bytes: z.number().int().nonnegative(),
});
export type FileFact = z.infer<typeof FileFactSchema>;

export const LanguageCountSchema = z.object({
  language: z.string().min(1),
  count: z.number().int().positive(),
});
export type LanguageCount = z.infer<typeof LanguageCountSchema>;

/**
 * The layer every adapter can fill without parsing anything: which files the
 * unit holds, in which languages, and what its folder name suggests.
 */
export const BaseFactsSchema = z.object({
  /** Sorted by path. */
  files: z.array(FileFactSchema),
  /** Sorted by count descending, then by language. */
  languages: z.array(LanguageCountSchema),
  roleHint: RoleHintSchema.nullable(),
});
export type BaseFacts = z.infer<typeof BaseFactsSchema>;

export const SymbolKindSchema = z.enum([
  "class",
  "const",
  "enum",
  "function",
  "interface",
  "method",
  "type",
  "other",
]);
export type SymbolKind = z.infer<typeof SymbolKindSchema>;

export const SymbolFactSchema = z.object({
  name: z.string().min(1),
  kind: SymbolKindSchema,
  /** Posix path relative to the workspace root. */
  file: z.string().min(1),
  signature: z.string().optional(),
  exported: z.boolean(),
  line: z.number().int().positive().optional(),
});
export type SymbolFact = z.infer<typeof SymbolFactSchema>;

/** The layer an AST-aware adapter (tree-sitter, ts-morph, ...) fills in. */
export const SymbolFactsSchema = z.object({
  /** Sorted by name. */
  symbols: z.array(SymbolFactSchema),
});
export type SymbolFacts = z.infer<typeof SymbolFactsSchema>;

export const RouteFactSchema = z.object({
  method: z.string().min(1),
  path: z.string().min(1),
  handler: z.string().optional(),
});
export type RouteFact = z.infer<typeof RouteFactSchema>;

/** The layer a framework-aware adapter (nestjs, laravel, ...) fills in. */
export const FrameworkFactsSchema = z.object({
  /** Framework id, e.g. "nestjs", "laravel". */
  name: z.string().min(1),
  /** Framework-specific role, e.g. "controller", "module", "eloquent-model". */
  role: z.string().optional(),
  /** Sorted by path, then method. */
  routes: z.array(RouteFactSchema),
  /** Injected tokens, imported modules, ... Sorted. */
  dependencies: z.array(z.string()),
});
export type FrameworkFacts = z.infer<typeof FrameworkFactsSchema>;

/**
 * Facts are layered so that a later adapter can add a layer without any other
 * adapter, or this type, having to change. `base` is always present;
 * `producedBy` lists the adapters that contributed, sorted.
 */
export const FactsSchema = z.object({
  base: BaseFactsSchema,
  symbols: SymbolFactsSchema.optional(),
  framework: FrameworkFactsSchema.optional(),
  producedBy: z.array(z.string().min(1)).min(1),
});
export type Facts = z.infer<typeof FactsSchema>;

/** A documentable slice of a project. */
export const UnitSchema = z.object({
  /** `${projectId}:${pathRelativeToProject}`. */
  id: z.string().min(1),
  projectId: z.string().min(1),
  kind: UnitKindSchema,
  /** Posix path relative to the project root, or "root". */
  name: z.string().min(1),
  /** Posix path relative to the workspace root. */
  path: z.string().min(1),
  facts: FactsSchema,
  /** sha256 over the sorted (path, content digest) pairs of the unit. */
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
