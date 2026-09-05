import fs from "node:fs/promises";
import path from "node:path";

import { compareStrings } from "@glossic/schema";
import type { DiscoverContext, EnrichContext, EnrichResult, Enricher, Relation, SymbolFact, Unit, UnitEnrichment } from "@glossic/schema";

import { extractFile } from "./extract/index.js";
import { grammar } from "./grammars.js";
import { MAX_PARSE_BYTES, grammarFor } from "./languages.js";
import { isRelative, resolveSpecifier } from "./resolve.js";

export const treesitterAdapterName = "treesitter";

/** Any of these at the project root means the project is worth handing to a parser. */
const MANIFESTS = ["package.json", "tsconfig.json", "jsconfig.json", "deno.json"];

/** Two units can import each other, so an edge is keyed by both of its ends. */
const EDGE_SEPARATOR = "\u0000";


const exists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

/** Undefined rather than a throw: a file that vanished mid-scan is not an error. */
const readSource = async (root: string, file: string): Promise<string | undefined> => {
  try {
    return await fs.readFile(path.resolve(root, file), "utf8");
  } catch {
    return undefined;
  }
};


/** Every file in the workspace mapped to the unit that owns it, for resolving an import. */
const indexFiles = (units: readonly Unit[]): Map<string, string> => {
  const owners = new Map<string, string>();

  for (const unit of units) {
    for (const fact of [...unit.facts.base.files, ...unit.facts.base.testFiles]) {
      owners.set(fact.path, unit.id);
    }
  }

  return owners;
};


interface UnitFacts {
  symbols: SymbolFact[];
  edges  : Map<string, number>;
}

const readUnit = async (root: string, unit: Unit, owners: ReadonlyMap<string, string>): Promise<UnitFacts> => {
  const parseable = unit.facts.base.files.filter(
    (fact) => grammarFor(fact.language) !== undefined && fact.bytes <= MAX_PARSE_BYTES,
  );

  const sources = await Promise.all(
    parseable.map((fact) => readSource(root, fact.path)),
  );

  const symbols: SymbolFact[]     = [];
  const edges  : Map<string, number> = new Map();

  for (const [index, fact] of parseable.entries()) {
    const source = sources[index];
    const name   = grammarFor(fact.language);

    if (source === undefined || name === undefined) continue;

    const extracted = extractFile(await grammar(name), source, fact.path);

    symbols.push(...extracted.symbols);

    for (const specifier of extracted.sources) {
      if (!isRelative(specifier)) continue;

      const to = resolveSpecifier(fact.path, specifier, owners);

      if (to === undefined || to === unit.id) continue;

      const key = `${unit.id}${EDGE_SEPARATOR}${to}`;

      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }

  return { symbols, edges };
};


const toRelations = (edges: ReadonlyMap<string, number>): Relation[] => {
  return [...edges.entries()]
    .map(([key, weight]) => {
      const [from = "", to = ""] = key.split(EDGE_SEPARATOR);

      return { from, to, kind: "imports" as const, weight };
    })
    .sort((a, b) => compareStrings(a.from, b.from) || compareStrings(a.to, b.to));
};


/**
 * Names the exported surface of every TypeScript and JavaScript file a base
 * adapter already grouped, and draws an edge wherever one unit imports another.
 * A specifier that leaves the workspace is not an edge, having no unit to reach.
 */
export const treesitterAdapter: Enricher = {
  name: treesitterAdapterName,

  detect: async (ctx: DiscoverContext): Promise<boolean> => {
    const dir     = path.resolve(ctx.root, ctx.project.rootDir);
    const present = await Promise.all(MANIFESTS.map((name) => exists(path.join(dir, name))));

    return present.includes(true);
  },

  enrich: async (ctx: EnrichContext): Promise<EnrichResult> => {
    const owners = indexFiles(ctx.units);
    const facts : Record<string, UnitEnrichment> = {};
    const edges = new Map<string, number>();

    for (const unit of ctx.units) {
      const read = await readUnit(ctx.root, unit, owners);

      if (read.symbols.length > 0) {
        facts[unit.id] = { symbols: { symbols: read.symbols } };
      }

      for (const [key, weight] of read.edges) {
        edges.set(key, (edges.get(key) ?? 0) + weight);
      }
    }

    return { facts, relations: toRelations(edges) };
  },
};

export { disposeGrammars } from "./grammars.js";
export { extractFile } from "./extract/index.js";
export { MAX_PARSE_BYTES, grammarFor } from "./languages.js";
export { candidatePaths, isRelative, resolveSpecifier } from "./resolve.js";
export type { FileFacts } from "./extract/index.js";
export type { GrammarName } from "./languages.js";
export default treesitterAdapter;
