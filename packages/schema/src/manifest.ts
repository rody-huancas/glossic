import { z } from "zod";
import { WorkspaceSchema } from "./workspace.js";
import { RelationSchema, UnitSchema } from "./unit.js";

/** Bumped by hand when the manifest shape changes. */
export const MANIFEST_VERSION = "1";


/** A whole scan, serialised. `generatedAt` is its only volatile field. */
export const ManifestSchema = z.object({
  version    : z.string().min(1),
  generatedAt: z.string().min(1),
  workspace  : WorkspaceSchema,
  units      : z.array(UnitSchema).default([]),
  relations  : z.array(RelationSchema).default([]),
});
export type Manifest = z.infer<typeof ManifestSchema>;
