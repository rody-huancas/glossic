import type { GlossicConfig } from "./config/index.js";
import type { Project, Workspace } from "./workspace.js";
import type { Facts, Relation, Unit } from "./unit.js";

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


/** The units a base adapter built, handed to an enricher that adds facts to them. */
export interface EnrichContext extends DiscoverContext {
  units: readonly Unit[];
}


/**
 * The facts one enricher adds to one unit. `base` is not here: it belongs to
 * the adapter that read the files, and nothing later is allowed to rewrite it.
 */
export type UnitEnrichment = Pick<Facts, "framework" | "symbols">;


/** What an enrichment pass produced: facts keyed by unit id, and new relations. */
export interface EnrichResult {
  facts    : Record<string, UnitEnrichment>;
  relations: Relation[];
}


/**
 * Adds facts to the units a base adapter already built. It never creates,
 * drops or renames one, so the shape of the manifest stays the adapter's.
 */
export interface Enricher {
  readonly name                : string;
  detect (ctx: DiscoverContext): Promise<boolean>;
  enrich (ctx: EnrichContext)  : Promise<EnrichResult>;
}


/** One entry of the chain the config names: a base adapter or an enricher. */
export type Layer = Adapter | Enricher;

/** Whether the layer is the kind that turns files into units. */
export const isAdapter = (layer: Layer): layer is Adapter => "discover" in layer;

/** Whether the layer is the kind that runs over units another layer built. */
export const isEnricher = (layer: Layer): layer is Enricher => "enrich" in layer;
