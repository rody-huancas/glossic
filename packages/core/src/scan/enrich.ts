import type { EnrichResult, ExtractResult, SymbolFact, Unit, UnitEnrichment } from "@glossic/schema";

import { compareStrings } from "../utils/index.js";

const compareSymbols = (a: SymbolFact, b: SymbolFact): number => {
  return compareStrings(a.file, b.file)
    || (a.line ?? 0) - (b.line ?? 0)
    || compareStrings(a.kind, b.kind)
    || compareStrings(a.name, b.name);
};


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
