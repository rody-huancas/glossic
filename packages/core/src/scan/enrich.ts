import type { EnrichResult, ExtractResult, SymbolFact, Unit, UnitEnrichment } from "@glossic/schema";

import { compareStrings } from "../utils/index.js";

/** Total order over symbols, so the list does not depend on which pass found them. */
const compareSymbols = (a: SymbolFact, b: SymbolFact): number => {
  return compareStrings(a.file, b.file)
    || (a.line ?? 0) - (b.line ?? 0)
    || compareStrings(a.kind, b.kind)
    || compareStrings(a.name, b.name);
};


/**
 * Folds one pass into one unit. Symbols accumulate across passes; a framework
 * block replaces the previous one, there being nothing to merge in a name.
 */
const mergeUnit = (unit: Unit, name: string, enrichment: UnitEnrichment | undefined): Unit => {
  if (enrichment?.symbols === undefined && enrichment?.framework === undefined) {
    return unit;
  }

  const symbols = enrichment.symbols === undefined
    ? unit.facts.symbols
    : {
        symbols: [...(unit.facts.symbols?.symbols ?? []), ...enrichment.symbols.symbols]
          .sort(compareSymbols),
      };

  const framework = enrichment.framework ?? unit.facts.framework;

  return {
    ...unit,
    facts: {
      ...unit.facts,
      ...(symbols   === undefined ? {} : { symbols }),
      ...(framework === undefined ? {} : { framework }),
      producedBy: [...unit.facts.producedBy, name],
    },
  };
};


/**
 * Applies one pass to what the adapter extracted. A unit the pass said nothing
 * about comes back untouched, `producedBy` included, and a relation naming a
 * unit that is not there is dropped: an enricher never invents one.
 */
export const applyEnrichment = (extracted: ExtractResult, name: string, result: EnrichResult): ExtractResult => {
  const units = extracted.units.map((unit) => mergeUnit(unit, name, result.facts[unit.id]));
  const known = new Set(units.map((unit) => unit.id));

  return {
    units,
    relations: [
      ...extracted.relations,
      ...result.relations.filter(({ from, to }) => known.has(from) && known.has(to)),
    ],
  };
};
