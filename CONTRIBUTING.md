# Contributing

## Setup

Node >= 20 and pnpm >= 10.

```bash
git clone https://github.com/rody-huancas/glosik.git
cd glosik
pnpm install
```

You can run the tests and the typechecker straight away, before building
anything: `tsconfig.base.json` maps `@glossic/*` to package sources and every
`vitest.config.ts` mirrors those aliases. Build only when you need a real
binary to run:

```bash
pnpm build
node packages/cli/dist/index.js --help
```

## Checks

All four must pass before a change is done:

```bash
pnpm lint        # biome, linter only — it never rewrites a file
pnpm typecheck   # tsc --noEmit in every package
pnpm test        # vitest in every package
pnpm build       # tsup, topological order
```

One package at a time:

```bash
pnpm --filter glossic test
pnpm --filter @glossic/core typecheck
```

Set `GLOSSIC_DEBUG=1` to get stack traces instead of one-line CLI errors.

## Conventions

The full set lives in [CLAUDE.md](CLAUDE.md). The ones that catch people out:

**Formatting is manual. Never run a formatter over this code.** Biome's
formatter is off on purpose and `pnpm lint` runs the linter alone. No
`biome format`, no format-on-save, no bulk reflow of a file you are editing in
one place. Object properties, type members and consecutive assignments are
aligned in a column by hand:

```ts
export interface RunOptions {
  binary    : string;
  args      : readonly string[];
  input    ?: string;
  timeoutMs : number;
}
```

**Arrow functions, not `function`.** There is not a single `function`
declaration in `packages/`. Classes are only for errors and for `Registry`.

**Comments go above the declaration, never inside it.** One line of JSDoc on
every exported function and constant, saying what it does and why when the why
is not obvious — never how. No `@param`, no `@returns`: the types already say
that. If a member of an interface needs explaining, explain it in the JSDoc
above the whole interface.

**Tests mirror the module they cover**, under `src/__tests__/`:
`commands/doctor.ts` is tested by `__tests__/commands/doctor.test.ts`. Tests
that drive the whole pipeline instead of one module go in `__tests__/e2e/`.

**ESM only.** No `require`, no `__dirname`. Relative imports carry the `.js`
extension.

**CLI output is deterministic.** Sort every list explicitly, break ties on a
second key, normalise paths to posix. Two runs over unchanged code must print
the same bytes.

## Changesets

Any change that touches a published package needs a changeset. It is what
decides the next version number and writes the changelog.

```bash
pnpm changeset
```

Pick the packages you changed, pick the bump, and write one line in the
present tense describing the change from the user's side — that line ends up
in the changelog, so write it for someone who did not read the diff.

Patch for a fix, minor for a new capability, major for a break. Commit the
generated file under `.changeset/` with your changes.

A change that touches only tests, docs or the repo's own tooling does not need
one.

## Commits and pull requests

Conventional commits, one concern per commit: `feat(cli):`, `fix(core):`,
`docs:`, `refactor:`, `test:`, `chore:`, `style:`.

Open the pull request against `master` with the four checks green.
