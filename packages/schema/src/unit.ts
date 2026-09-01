import { z } from "zod";

export const UnitKindSchema = z.enum(["directory", "module", "file"]);
export type UnitKind = z.infer<typeof UnitKindSchema>;

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
  path    : z.string().min(1),
  language: z.string().min(1),
  bytes   : z.number().int().nonnegative(),
});
export type FileFact = z.infer<typeof FileFactSchema>;


export const LanguageCountSchema = z.object({
  language: z.string().min(1),
  count   : z.number().int().positive(),
});
export type LanguageCount = z.infer<typeof LanguageCountSchema>;


export const BaseFactsSchema = z.object({
  files       : z.array(FileFactSchema),
  testFiles   : z.array(FileFactSchema),
  ignoredFiles: z.array(FileFactSchema),
  languages   : z.array(LanguageCountSchema),
  roleHint    : RoleHintSchema.nullable(),
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
  file: z.string().min(1),
  signature: z.string().optional(),
  exported: z.boolean(),
  line: z.number().int().positive().optional(),
});
export type SymbolFact = z.infer<typeof SymbolFactSchema>;


export const SymbolFactsSchema = z.object({
  symbols: z.array(SymbolFactSchema),
});
export type SymbolFacts = z.infer<typeof SymbolFactsSchema>;


export const RouteFactSchema = z.object({
  method: z.string().min(1),
  path: z.string().min(1),
  handler: z.string().optional(),
});
export type RouteFact = z.infer<typeof RouteFactSchema>;


export const FrameworkFactsSchema = z.object({
  name        : z.string().min(1),
  role        : z.string().optional(),
  routes      : z.array(RouteFactSchema),
  dependencies: z.array(z.string()),
});
export type FrameworkFacts = z.infer<typeof FrameworkFactsSchema>;


export const FactsSchema = z.object({
  base      : BaseFactsSchema,
  symbols   : SymbolFactsSchema.optional(),
  framework : FrameworkFactsSchema.optional(),
  producedBy: z.array(z.string().min(1)).min(1),
});
export type Facts = z.infer<typeof FactsSchema>;


export const UnitSchema = z.object({
  id       : z.string().min(1),
  projectId: z.string().min(1),
  kind     : UnitKindSchema,
  name     : z.string().min(1),
  path     : z.string().min(1),
  facts    : FactsSchema,
  hash     : z.string().min(1),
  summary  : z.string().optional(),
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


export const RelationSchema = z.object({
  from  : z.string().min(1),
  to    : z.string().min(1),
  kind  : RelationKindSchema,
  weight: z.number().optional(),
});
export type Relation = z.infer<typeof RelationSchema>;
