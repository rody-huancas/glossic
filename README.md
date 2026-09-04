# glossic

Generates and maintains the documentation of a codebase from the code itself, and fails your CI when the two drift apart.

Documentation rots because nothing checks it. glossic reads your source, groups it into units, has an LLM write a page per unit, and records a hash of what each page was written from. When a unit changes, `glossic check` names the exact file to regenerate — and `glossic generate` regenerates only that one.

---

## Demo

`glossic scan` reads the workspace and reports it. No network, no LLM, no writes without `--out`:

```
$ glossic scan ./examples/monorepo
example-monorepo — pnpm monorepo

@example/api (packages/api)
└─ src  4 files  typescript

@example/web (packages/web)
└─ src  4 files  tsx

2 projects, 2 units, 8 files
languages: typescript 5, tsx 3

manifest: examples/monorepo/.glossic/manifest.json
```

`glossic generate` writes one markdown file per unit. This is the top of a real
`packages/api/src.md`, unedited:

````markdown
---
title: "src"
unit: "packages/api:src"
project: "packages/api"
path: "packages/api/src"
hash: "a227d044500e893fc0ab813a014fc48dcbc43aceca9d98191fbf5b246b31e0e9"
files: 4
generatedAt: "2026-09-01T23:26:57.451Z"
---

# @example/api — `src`

HTTP API package for the `example-monorepo` workspace. It exposes a small server
factory that assembles a route table from feature-scoped route modules, which in
turn delegate to service functions holding the domain logic.

## Architecture

The package is organized in four layers, wired top-down with no cycles:

```
index.ts              createServer()      composition root
  └─ routes/index.ts  registerRoutes()    route aggregation
       └─ routes/orders.routes.ts         route definitions (method, path, handler)
            └─ services/orders.service.ts business logic + data access
```

Each layer only imports downward, so a service never knows about HTTP and a
route never knows about the server.
````

The `hash` in the frontmatter is what `glossic check` compares against the code.

---

## Install

```bash
npm install -g glossic
# or
pnpm add -g glossic
```

Per project instead of globally:

```bash
pnpm add -D glossic && pnpm exec glossic --help
```

**Requirements**

- Node >= 20.
- One way to reach a model, either of:
  - the [Claude Code](https://claude.com/claude-code) CLI signed in — uses your existing subscription, no API key;
  - an `ANTHROPIC_API_KEY` from [console.anthropic.com](https://console.anthropic.com/settings/keys).

`scan` and `check` need neither. Only `generate` calls a model.

Run `glossic doctor` to see what your machine has:

```
$ glossic doctor
glossic doctor

node      22.20.0
platform  win32-x64

providers
  ok       claude-code  <- would be used
  missing  anthropic

adapters  nestjs, treesitter, generic
config    none (glossic.config.ts not found)

effective configuration
  ...every option, its value and which source decided it

Ready: `glossic generate` would use claude-code.
```

It exits `1` when nothing is available, and prints how to fix that.

---

## Quickstart

```bash
glossic scan          # see the units it found, write nothing
glossic generate      # write docs/ — this is the step that calls a model
glossic check         # exits 1 if any page is behind its code
```

Add `--dry-run` to `generate` to see the plan and the token estimate before
spending anything:

```
$ glossic generate --dry-run
dry run — no provider was called, nothing was written to examples/monorepo/docs

  packages/api:src    4 files     759 tokens  new    packages/api/src.md
  packages/web:src    4 files     865 tokens  new    packages/web/src.md

2 generated, 0 from cache, 0 failed
~2k input tokens estimated
```

---

## How it works

**scan** resolves the workspace (`pnpm-workspace.yaml`, `package.json` workspaces, turbo, nx, lerna, or a single project), groups each project's source files into *units* — roughly one per directory that holds source — and hashes each unit over its sorted file digests.

**generate** sends one prompt per unit, containing that unit's facts and the full text of its files, and writes the answer as markdown with the unit hash in the frontmatter.

**check** scans again and compares each unit's current hash against the hash recorded in its page, reporting three things: units with no page, pages written from older code, and pages whose unit no longer exists.

### The cache is the point

`generate` records what it wrote in `.glossic/cache.json`. A unit is sent to the
model again only when one of these changed:

- the unit's hash — its files, their contents, or which bucket they landed in;
- `PROMPT_VERSION`, bumped by hand whenever the system prompt changes;
- the model, or the documentation language;
- or its `.md` is missing.

Everything else is served from disk. On a repo where you touched three files,
`generate` costs three completions rather than three hundred, and the run tells
you what that saved. Commit `.glossic/cache.json` next to `docs/` so the next
person gets the same deal. `.glossic/manifest.json` is a scan artifact and does
not need committing.

A file that is hashed but never documented — a test, a migration — counts
towards the unit it sits under, so editing it invalidates that unit's page.
There is one shape where it counts towards nothing at all: see
[Known limitations](#known-limitations).

### Before a big run

`generate` knows the size of the plan before it sends anything, so that is when
it says so. A run that resumes says what is left, and a run over
`warnAboveUnits` says what it risks:

```
38 units pending, 109 already generated
This project has 147 units (~380k estimated tokens).
Generating it all at once may exhaust your quota.
```

On a terminal it then asks what to do about it: generate everything at once,
generate one project at a time, or nothing at all. One project at a time runs
the same work project by project and comes back to the list after each, with the
finished ones marked done — the cache is what keeps them out of the next pass.

In CI, in a pipe, or under `--quiet` there is nobody to ask: the warning is
printed and the run carries on.

### When the quota runs out

A provider that says it has nothing left to spend fails every remaining unit the
same way, so `generate` stops on the first one instead of paying the timeout for
each of the other hundred. The same is true of a missing `claude` binary and of
a session that is not signed in: all three are facts about the machine or the
account, not about the unit that happened to ask.

It reports the unit it stopped on and how many were never sent:

```
1 generated, 12 from cache, 1 failed, 132 not attempted
  failed: api:src/orders [quota] — Claude AI usage limit reached

stopped on api:src/orders [quota] — 132 units were never sent
What was generated is cached; run the same command again to continue where it stopped.
```

Everything written before the stop is on disk and in the cache, so running the
same command once the quota resets picks up where it left off — on a terminal
`generate` says so and offers to retry there and then. A rate limit is a
different thing and is still retried with backoff.

Failures print the provider's own sentence rather than the envelope it arrived
in. Set `GLOSSIC_DEBUG=1` to keep the raw answer alongside it.

---

## Providers

| Provider | Needs | Notes |
| --- | --- | --- |
| `claude-code` | the `claude` CLI in `PATH`, signed in | Uses your existing Claude subscription. No API key, no per-token billing. |
| `anthropic` | `ANTHROPIC_API_KEY` | `@anthropic-ai/sdk`, default model `claude-opus-5`. |

**You do not have to pick.** With nothing configured, glossic probes
`claude-code` first and falls back to `anthropic`. The full order is:

```
--provider  →  glossic.config.ts  →  saved preference  →  claude-code  →  anthropic
```

The saved preference is set from the interactive menu (`glossic` with no
arguments → *Connection*), which can also store an API key for you. It lives in
your per-user config directory, not in the repository.

Two things worth knowing about `claude-code`:

- It is slower. `claude -p` boots the whole coding agent before answering, so its
  timeout is 300s against 120s elsewhere. With an API key and a large workspace,
  `--provider anthropic` finishes sooner.
- glossic strips the agent back to a plain completion — `--allowed-tools ""`,
  `--setting-sources ""`, `--strict-mcp-config`, and an empty temp directory as
  its cwd — so it writes the document instead of answering you. Without that, one
  run produced a page whose entire content was *"I've drafted the documentation
  but need write permission to save it"*.

Whatever the provider, a reply that addresses the reader, asks a question or is
too short to be a document is rejected rather than written.

---

## Configuration

`glossic init` writes a `glossic.config.ts` with every option commented out at
its default.

| Option | Default | What it does |
| --- | --- | --- |
| `include` | `["**/*"]` | Globs walked, relative to each project root. |
| `exclude` *(additive)* | build output of every ecosystem: `obj`, `out`, `build`, `dist`, `target`, `coverage`, `__pycache__`, `.gradle`, `.tox`, `tmp`, `storage/framework`, … | What your own build emits, never walked into. Code that is not yours — `node_modules`, `vendor`, `.venv`, `site-packages`, the VCS — is the adapter's hard ignore and is not configurable. |
| `adapters` | `["nestjs", "treesitter", "generic"]` | Adapter ids in priority order; the first whose `detect()` passes wins. |
| `ignoreUnits` *(additive)* | config files, manifests, dotfiles, migrations, seeds, `bin`, and the generated code of every ecosystem (`*.pb.go`, `*_pb2.py`, `*.Designer.cs`, `R.java`, …) | Files with no documentable content. A unit whose files all match is dropped. Matched without regard to case, so .NET's `Migrations/` meets `**/migrations/**`. |
| `excludeFromContent` *(additive)* | `**/__tests__/**`, `**/test/**`, `**/tests/**`, `**/spec/**`, `*.test.*`, `*.spec.*`, `*_test.go`, `test_*.py`, `*_test.py`, `*_test.rs`, `*_spec.rb` | Counted in the unit hash, never sent as prompt content. |
| `mergeChildrenInto` | `25` | A directory absorbs every descendant when together they stay at or below this many files. |
| `minUnitFiles` | `3` | A leaf unit below this is folded into the unit above it, unless it has subdirectories or a role of its own. |
| `maxUnitFiles` | `10` | A unit above this is split by filename root. |
| `provider` | auto | `claude-code` or `anthropic`. Unset means auto-detect. |
| `model` | provider's own | Pin it if you want the cache to notice the model changing. |
| `lang` | `"en"` | ISO 639-1 code the documentation is written in. |
| `uiLang` | `"en"` | Language of the CLI itself: `en` or `es`. |
| `temperature` | unset | Left unset on purpose: recent Claude models reject sampling parameters. |
| `concurrency` | `3` | Completions in flight at once. |
| `timeoutMs` | `300000` | Milliseconds before one completion is abandoned. |
| `warnAboveUnits` | `30` | Units a run may plan before `generate` says so up front. Set it higher than any project you have to stop asking. |
| `output.dir` | `"docs"` | Where `generate` writes, relative to the workspace root. |
| `output.manifest` | `".glossic/manifest.json"` | Where `scan` writes. |

One precedence chain applies to all of them:

```
--flag  →  glossic.config.ts  →  saved preference  →  default
```

`glossic doctor` prints the resolved value and the origin of every option, which
is the fastest way to find out why glossic did something you did not expect.

**Changing a grouping option invalidates pages.** `include`, `exclude`,
`ignoreUnits`, `excludeFromContent`, `minUnitFiles`, `maxUnitFiles` and
`mergeChildrenInto` decide which files land in which unit. Change one and the
affected units are regenerated, because the unit hash covers the bucket each
file landed in, not just its path and contents.

**The three long lists are additive.** `exclude`, `ignoreUnits` and
`excludeFromContent` add to their default rather than replacing it; to drop one
of the defaults, prefix that entry with `-`.

```ts
export default {
  exclude: [
    "**/legacy/**",   // added to the default
    "-**/out/**",     // dropped from the default
  ],
};
```

A `-` entry that matches no default is reported rather than ignored, because a
typo there fails silently otherwise. `include` and `adapters` still replace:
one is a single glob and the other is an ordered priority list, so merging
either would be wrong.

`glossic doctor` prints all three resolved lists one pattern per line, marked
`default`, `added` or `removed`, which is the fastest way to see what your
config actually did.

### Known limitations

**A test or a migration at the project root counts towards no hash.**

A unit is a directory that holds documentable source. A directory that holds
none — a `tests/` folder holds only tests, a `migrations/` folder holds only
files matched by `ignoreUnits` — never becomes a unit of its own; its files are
pushed up to the nearest unit above it, so they still count towards *that*
unit's hash. When there is no unit above it, they are pushed nowhere and count
towards nothing.

That is what happens when the folder sits at the project root, beside `src/`,
`app/` or `internal/` rather than inside it — which is the convention in most
of the ecosystems that are not JS/TS:

| | Affected | Not affected |
| --- | --- | --- |
| Python | `tests/`, `alembic/versions/` | |
| .NET | `tests/` | `src/Api/Migrations/`, inside the project |
| Rust | `tests/`, `benches/` | |
| PHP | `tests/`, `database/migrations/` | |
| Ruby | `spec/`, `db/migrate/` | |
| Go | | `internal/handlers/users_test.go`, beside the code |
| JS/TS | a root `test/` | `src/**/__tests__/`, inside the tree |

**The practical consequence: in those projects, changing a test does not mark
the documentation as out of date.** No unit hash moves, so `glossic check`
stays green and `generate` serves every page from the cache. Editing the code
under `src/` still invalidates normally — it is only the root-level test and
migration folders that go unnoticed.

A test that sits beside the code it covers is unaffected: it has a unit above
it, so it counts towards that unit's hash without ever being sent as content.
That is the shape Go and JS/TS use, and the one to prefer if it is open to you.

**Workaround.** Drop `**/tests/**` from `excludeFromContent` and the folder
becomes a unit in its own right, with its own hash — so editing a test does
invalidate something again. The cost is that it stops being merely hashed: its
files are sent to the provider as prompt content, and it gets its own page in
`docs/`. You pay tokens for test code, which is what `excludeFromContent`
exists to avoid.

```ts
export default {
  excludeFromContent: ["-**/tests/**"],
};
```

Dropping the directory pattern alone is not always enough, because a file can
be caught by a filename pattern as well. Python is the one to watch: it needs
its filename patterns out too, and `conftest.py` out of `ignoreUnits`, before
the folder holds anything documentable.

```ts
export default {
  excludeFromContent: ["-**/tests/**", "-**/test_*.py", "-**/*_test.py"],
  ignoreUnits       : ["-**/conftest.py"],
};
```

`glossic scan` settles it either way. If the workaround took, the folder shows
up in the manifest as a unit of its own; if it did not, it is still absent.

---

## In CI

`glossic check` needs no provider and no API key, so it cannot fail for
credentials and costs nothing to run on every pull request.

```yaml
# .github/workflows/docs.yml
name: docs

on:
  pull_request:
  push:
    branches: [master]

jobs:
  check:
    name: documentation is up to date
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm exec glossic check
```

When a page falls behind, the job fails and names the file:

```
$ glossic check
documentation is out of date

  stale  docs/packages/api/src.md  packages/api:src changed

1 problem, 1 unit up to date

Regenerate the stale and missing documents with:

  glossic generate .

The cache regenerates exactly the units listed above.
```

The fix is one command, and the cache keeps it to the units that actually
changed:

```bash
glossic generate
git add docs .glossic/cache.json
```

---

## Roadmap

- **tree-sitter extraction.** The `treesitter` adapter is registered but claims
  nothing yet. It will give the prompt real symbols — exported functions, classes,
  signatures — instead of only paths and sizes.
- **NestJS adapter.** Same: registered, claims nothing. Modules, controllers,
  providers and routes recognised as such, so a page can describe an endpoint
  rather than a file.
- **Static site output.** The frontmatter already feeds Starlight and Docusaurus
  unchanged; the missing piece is a command that builds the site.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set the repo up, run the tests
and record a changeset. The one rule that surprises people: **formatting is
manual and no formatter runs over this codebase.**

## License

[MIT](LICENSE) © Rody Huancas
