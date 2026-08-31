import type { GlossicConfig } from "./config.js";
import type { Relation, Unit } from "./unit.js";
import type { Project, Workspace } from "./workspace.js";

/** Shared context handed to every adapter method. */
export interface AdapterContext {
  /** Absolute path to the workspace root. */
  root: string;
  workspace: Workspace;
  config: GlossicConfig;
}

export interface DiscoverContext extends AdapterContext {
  project: Project;
}

/** A unit as returned by `discover`: grouped files, no facts yet. */
export interface DiscoveredUnit {
  id: string;
  projectId: string;
  /** Posix path relative to the project root, or "root". */
  name: string;
  /** Posix path relative to the workspace root. */
  path: string;
  /** Posix paths relative to the workspace root, sorted. */
  files: string[];
}

export interface ExtractContext extends DiscoverContext {
  units: DiscoveredUnit[];
}

export interface ExtractResult {
  units: Unit[];
  relations: Relation[];
}

/**
 * Turns a project into units, facts and relations. Purely static: an adapter
 * never talks to an LLM and never hits the network.
 */
export interface Adapter {
  /** Unique adapter id, e.g. "generic", "nestjs". */
  readonly name: string;
  /** Can this adapter handle the project? */
  detect(ctx: DiscoverContext): Promise<boolean>;
  /** Group the project's source files into units. */
  discover(ctx: DiscoverContext): Promise<DiscoveredUnit[]>;
  /** Turn discovered units into units carrying facts and a hash. */
  extract(ctx: ExtractContext): Promise<ExtractResult>;
}
