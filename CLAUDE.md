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

Relative imports form their own group, last, separated by a blank line.
Everything else — node built-ins, third-party packages and the workspace's own
`@glossic/*` packages — comes before it. Splitting the built-ins into a
paragraph of their own is fine. Within the relative group, type-only imports
come last. **Do not align imports with extra spaces.**

```ts
import fs from "node:fs/promises";
import path from "node:path";

import { compareStrings } from "@glossic/schema";
import type { FileFact, LanguageCount } from "@glossic/schema";

import { sha256 } from "./hash.js";
import { inferLanguage } from "./languages.js";
```

## Formatting

**The author owns the formatting, not the tool.** Biome's formatter is off.
`pnpm lint` runs the linter alone: it reports real errors, never rewrites a
file and never fails over style.

- Align the values of object properties, type members and consecutive
  assignments so the block reads as a column. This holds in every package,
  tests included where it helps.
- The `?` of an optional member sits in the slot just before the colon, so
  required and optional members share one colon column.
- A comment, a blank line, a shorthand property or a value that wraps onto the
  next line ends the block and starts a new column.
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

Every exported function and constant carries a one-line JSDoc, and so does
every exported type in `@glossic/schema`, every error class, and any internal
function whose intent its name does not give away. English, above the
declaration, never anywhere else.

- **Say what it does, and why when the why is not obvious. Never how.**
- **One line.** Use the multi-line form only when a second line is genuinely
  needed; there is no third line.
- No `@param` and no `@returns`. The types already say that. Document a
  parameter only when it carries a constraint the type cannot express.
- **Never inside an interface or inside a block of code.** If a member needs
  context, name it in the JSDoc above the whole declaration.
- Never restate the name. `checkCommand(): Command` is finished as it is; a
  getter, a one-line wrapper and a barrel re-export take nothing. Prefer a
  missing comment to a redundant one.

```ts
/** Bumped by hand when the prompt changes, which invalidates every cached unit. */
export const PROMPT_VERSION = "3";

/**
 * Merges the sources under one precedence chain (flags, project config, saved
 * preference, schema defaults) and records which one won each key.
 */
export const resolveConfig = (sources: ConfigSources = {}): ResolvedConfig => {
```

A member that needs explaining is explained from above, not beside:

```ts
// Bad
export interface RetryOptions {
  attempts?: number;
  /** injected so a test can drive the loop without waiting */
  sleep   ?: (ms: number) => Promise<void>;
}

// Good
/** `sleep` and `onRetry` exist so a test can drive the loop without waiting. */
export interface RetryOptions {
```

## File layout

A file that grows past what one screen can hold becomes a directory with an
`index.ts` barrel, one file per responsibility.

```
core/src/generate/{types,decide,jobs,index}.ts
adapters/generic/src/grouping/{paths,draft,merge,split,index}.ts
cli/src/render/{scan,generate,check,shared}.ts + index.ts
```

- **The split never changes the package's public API.** The barrel re-exports
  exactly what the single file exported before. Name the re-exports one by one
  wherever `export *` would leak a helper the folder only shares internally;
  `export *` is fine for a module that is entirely public, such as a `types.ts`.
  The generated `.d.ts` is the check: it must not move.
- `index.ts` holds the orchestrator or the entry point, not a pile of
  re-exports plus unrelated code.
- A helper only one folder uses stays inside it. Promote it to `utils/` only
  when a second caller appears.

## Tests

Every package keeps its tests under `src/__tests__/`, mirroring the path of
the module they cover: `commands/doctor.ts` is tested by
`__tests__/commands/doctor.test.ts`, `ui/banner.ts` by
`__tests__/ui/banner.test.ts`. The test file is named after the module, not
after the behaviour it happens to exercise.

- Tests that do not cover one module — they drive the whole pipeline end to
  end through the registries — go in `__tests__/e2e/`, named after the command
  or the behaviour they exercise: `e2e/scan.test.ts`, `e2e/cache.test.ts`.
- A test that genuinely spans two modules keeps a name that says what it
  proves, at the root of `__tests__/`: `out-dir.test.ts` covers the precedence
  of the output directory across `commands/generate.ts` and `interactive/`.
- Snapshots live in a `__snapshots__/` directory beside the test that writes
  them; static input files live in `src/__fixtures__/`.
- Each `vitest.config.ts` includes exactly `src/__tests__/**/*.test.ts`, so a
  test left outside the directory is not picked up.

## Shared utilities

Pure helpers with no dependencies — string comparison, posix path handling —
live in `@glossic/schema/src/utils/`. They are there rather than in core
because adapters need them and adapters may only depend on schema.

Anything that touches the disk lives in `@glossic/core/src/utils/fs.ts`.
Schema is a package of types and validators; giving it `node:fs/promises`
would make it something else.

`core/src/utils/index.ts` re-exports both halves, so code inside core has one
import site for utilities and `@glossic/core` keeps exporting them.

**Never write a second copy of a helper that already exists.** `compareStrings`
was implemented three times and `toPosix` twice before they were consolidated.

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
An adapter never imports core — that is the constraint that decides where a
shared helper lives.

## Checks

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` must all pass
before a change is done.
