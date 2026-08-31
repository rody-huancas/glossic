import { z } from "zod";

export const ProjectKindSchema = z.enum(["app", "lib", "service", "package", "unknown"]);
export type ProjectKind = z.infer<typeof ProjectKindSchema>;

/** A single analyzable unit of code ownership inside a workspace. */
export const ProjectSchema = z.object({
  /** Stable identifier, unique inside the workspace. */
  id: z.string().min(1),
  name: z.string().min(1),
  /** Absolute or workspace-relative path to the project root. */
  root: z.string().min(1),
  kind: ProjectKindSchema,
  /** Primary language, e.g. "typescript", "php". */
  language: z.string().min(1),
  /** Detected framework, e.g. "nestjs", "express", "laravel". */
  framework: z.string().optional(),
  /** Name of the adapter that discovered this project. */
  adapter: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

/** The repository (or folder) being documented, plus every project inside it. */
export const WorkspaceSchema = z.object({
  name: z.string().min(1),
  root: z.string().min(1),
  /** e.g. "pnpm", "npm", "turbo", "none". */
  packageManager: z.string().optional(),
  projects: z.array(ProjectSchema).default([]),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
