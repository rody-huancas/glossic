import { z } from "zod";

export const WorkspaceToolSchema = z.enum([
  "pnpm",
  "npm-workspaces",
  "turbo",
  "nx",
  "lerna",
  "none",
]);

export type WorkspaceTool = z.infer<typeof WorkspaceToolSchema>;


export const ProjectSchema = z.object({
  id            : z.string().min(1),
  name          : z.string().min(1),
  rootDir       : z.string().min(1),
  packageManager: z.string().optional(),
});

export type Project = z.infer<typeof ProjectSchema>;


export const WorkspaceSchema = z.object({
  name          : z.string().min(1),
  root          : z.string().min(1),
  isMonorepo    : z.boolean(),
  tool          : WorkspaceToolSchema,
  packageManager: z.string().optional(),
  projects      : z.array(ProjectSchema),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;
