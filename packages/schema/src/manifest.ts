import { z } from "zod";

import { RelationSchema, UnitSchema } from "./unit.js";
import { WorkspaceSchema } from "./workspace.js";

/** Schema version of the manifest document itself. */
export const MANIFEST_VERSION = "1";

/**
 * The full, serializable output of a glossic run. `generatedAt` is the only
 * volatile field: everything else must be byte-identical across runs.
 */
export const ManifestSchema = z.object({
  version: z.string().min(1),
  /** ISO-8601 timestamp. */
  generatedAt: z.string().min(1),
  workspace: WorkspaceSchema,
  units: z.array(UnitSchema).default([]),
  relations: z.array(RelationSchema).default([]),
});
export type Manifest = z.infer<typeof ManifestSchema>;
