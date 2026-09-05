import type { GlossicConfig } from "./config/index.js";
import type { Project, Workspace } from "./workspace.js";
import type { Facts, Relation, Unit } from "./unit.js";

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


export interface EnrichContext extends DiscoverContext {
  units: readonly Unit[];
}


export type UnitEnrichment = Pick<Facts, "framework" | "symbols">;


export interface EnrichResult {
  facts    : Record<string, UnitEnrichment>;
  relations: Relation[];
}


export interface Enricher {
  readonly name                : string;
  detect (ctx: DiscoverContext): Promise<boolean>;
  enrich (ctx: EnrichContext)  : Promise<EnrichResult>;
}


export type Layer = Adapter | Enricher;

export const isAdapter = (layer: Layer): layer is Adapter => "discover" in layer;

export const isEnricher = (layer: Layer): layer is Enricher => "enrich" in layer;
