import type { GlossicConfig } from "./config.js";
import type { Relation, Unit } from "./unit.js";
import type { Project, Workspace } from "./workspace.js";

export interface AdapterContext {
  root     : string;
  workspace: Workspace;
  config   : GlossicConfig;
}

export interface DiscoverContext extends AdapterContext {
  project: Project;
}


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


export interface Adapter {
  readonly name                 : string;
  detect  (ctx: DiscoverContext): Promise<boolean>;
  discover(ctx: DiscoverContext): Promise<DiscoveredUnit[]>;
  extract (ctx: ExtractContext) : Promise<ExtractResult>;
}
