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

Open the pull request against `develop` with the four checks green.

## Branches and releases

Day-to-day work goes to `develop`. `master` only ever holds what has been
released.

```
your branch  ──▶  develop  ──▶  master  ──▶  npm
                   (CI)        (release)
```

1. Branch off `develop`, and open the pull request back into `develop`. CI runs
   the four checks on every pull request and on every push to either branch.
2. **Add a changeset with the change**, in the same pull request. Without one
   the change ships silently: no version bump, no changelog line.
3. Merging `develop` into `master` starts the release. The workflow runs the
   same four checks first, then does one of two things:
   - **changesets pending** — it opens or updates a *Version Packages* pull
     request carrying the bumps and the changelog. Nothing is published yet.
   - **none pending**, which is what merging that pull request leaves behind —
     it publishes to npm at the versions the merge just wrote.

The eight packages are versioned together, so they never drift apart: a bump to
one is a bump to all.

Releasing needs two repository secrets, `NPM_TOKEN` and the `GITHUB_TOKEN` that
Actions provides. Neither is used anywhere outside `release.yml`, and nothing on
`develop` or in a pull request can publish.
