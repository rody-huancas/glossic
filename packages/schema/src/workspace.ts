import { z } from "zod";

/** How the monorepo was declared, or "none" for a single-project repository. */
export const WorkspaceToolSchema = z.enum([
  "pnpm",
  "npm-workspaces",
  "turbo",
  "nx",
  "lerna",
  "none",
]);
export type WorkspaceTool = z.infer<typeof WorkspaceToolSchema>;

/** A single analyzable unit of code ownership inside a workspace. */
export const ProjectSchema = z.object({
  /** Stable identifier: the posix path relative to the workspace root, or "root". */
  id: z.string().min(1),
  name: z.string().min(1),
  /** Posix path relative to the workspace root; "." for the workspace itself. */
  rootDir: z.string().min(1),
  /** "pnpm" | "npm" | "yarn" | "bun" | "composer", when one can be inferred. */
  packageManager: z.string().optional(),
});
export type Project = z.infer<typeof ProjectSchema>;

/** The repository being documented, plus every project inside it. */
export const WorkspaceSchema = z.object({
  name: z.string().min(1),
  /** Absolute path to the workspace root. */
  root: z.string().min(1),
  isMonorepo: z.boolean(),
  tool: WorkspaceToolSchema,
  packageManager: z.string().optional(),
  projects: z.array(ProjectSchema),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
