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

**Biome owns the formatting.** Do not hand-align anything, do not argue with
the formatter, and do not add editor directives to work around it. Run
`pnpm lint:fix` and let it decide line breaks and spacing; `pnpm lint` is the
source of truth in CI.

Keep the readability effort where the formatter cannot reach: one property per
line, grouped and ordered on purpose, short functions, names that do not need
a comment.

## Comments

Write a comment only when it earns its place: a non-obvious invariant, a
deliberate trade-off, a reference to an external contract. Never restate what
the code already says.

```ts
// Bad
// increment the counter
count += 1;

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
