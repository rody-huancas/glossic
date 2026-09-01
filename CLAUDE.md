# CLAUDE.md

Conventions for this repository. They apply to every package under `packages/`.

## Language and runtime

- **ESM only.** No CommonJS, no `require`, no `__dirname`. Use
  `import.meta.url` + `node:url` when a path relative to a module is needed.
- **Node >= 20.** Prefer built-ins (`node:fs/promises`, `node:crypto`,
  `node:path`) over dependencies.
- **TypeScript strict.** `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes` and `verbatimModuleSyntax` are all on. Relative
  imports carry the `.js` extension.

## Imports

Group imports: external libraries first, then our own code. Separate the two
groups with a blank line. **Do not align imports with extra spaces.**

```ts
import { createHash } from "node:crypto";
import { glob } from "tinyglobby";

import type { Adapter, Unit } from "@glossic/schema";
import { inferLanguage } from "./languages.js";
```

## Formatting

**The author owns the formatting, not the tool.** Biome's formatter is off.
`pnpm lint` runs the linter alone: it reports real errors, never rewrites a
file and never fails over style.

- Align the values of object properties, type members and consecutive
  assignments so the block reads as a column.
- Do not align imports.
- **Never run a formatter over existing code.** No `biome format`, no
  format-on-save, no bulk reflow of a file you are editing in one place.

```ts
export interface RunOptions {
  binary    : string;
  args      : readonly string[];
  input    ?: string;
  timeoutMs : number;
}

const MAX_FILE_BYTES  = 24_000;
const CHARS_PER_TOKEN = 4;
const SPLIT_SEPARATOR = "~~";
```

## Comments

Only the essential. A comment earns its place when it records a non-obvious
invariant, a deliberate trade-off or an external contract.

- Never explain the obvious or restate what the code already says.
- No comments interleaved inside an interface or a block of code. If a
  declaration needs context, put it above the whole declaration.

```ts
// Bad
export interface CacheEntry {
  // the unit this entry belongs to
  unitId  : string;
  // bumped by hand when the prompt changes
  version : string;
}

// Good
// Sorted before hashing so the digest does not depend on filesystem order.
files.sort();
```

## CLI output

**Every byte the CLI prints must be deterministic and ordered.** Two runs over
unchanged code produce identical output.

- Sort every list explicitly; never rely on filesystem or `Map` order.
- Sort ties by a second key so the order is total.
- Normalize paths to posix separators, relative to a known root.
- No timestamps, durations, absolute paths or random ids inside units. The only
  volatile field in the manifest is the top-level `generatedAt`.

## Package boundaries

```
@glossic/schema     -> no internal dependencies
@glossic/core       -> schema
adapters/providers -> schema
glossic (cli)       -> core, schema, adapters, providers
```

Core never imports an adapter or a provider: they are passed in as arguments.

## Checks

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` must all pass
before a change is done.
