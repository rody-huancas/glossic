import type { GlossicConfig } from "./config/index.js";
import type { Relation, Unit } from "./unit.js";
import type { Project, Workspace } from "./workspace.js";

/** What every adapter call receives: the workspace being scanned and the resolved config. */
export interface AdapterContext {
  root     : string;
  workspace: Workspace;
  config   : GlossicConfig;
}

export interface DiscoverContext extends AdapterContext {
  project: Project;
}


/** A unit as discovery found it: paths only, before a single file has been read. */
export interface DiscoveredUnit {
  id          : string;
  projectId   : string;
  name        : string;
  path        : string;
  files       : string[];
  testFiles   : string[];
  ignoredFiles: string[];
}


export interface ExtractContext extends DiscoverContext {
  units: DiscoveredUnit[];
}


export interface ExtractResult {
  units    : Unit[];
  relations: Relation[];
}


/**
 * Turns a project's files into units. `detect` decides whether this adapter
 * claims the project; the first one that says yes wins.
 */
export interface Adapter {
  readonly name                 : string;
  detect  (ctx: DiscoverContext): Promise<boolean>;
  discover(ctx: DiscoverContext): Promise<DiscoveredUnit[]>;
  extract (ctx: ExtractContext) : Promise<ExtractResult>;
}
