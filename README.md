# glossic

Monorepo scaffold for **glossic**, a documentation generator driven by static
analysis (adapters) plus optional LLM completion (providers).

> Status: scaffold only. Every command and adapter/provider method is a stub.

## Packages

| Package | Path | Description |
| --- | --- | --- |
| `@glossic/schema` | `packages/schema` | Zod schemas + inferred types. Depends on nothing in the repo. |
| `@glossic/core` | `packages/core` | Orchestration layer. Depends only on `@glossic/schema`. |
| `glossic` | `packages/cli` | The `glossic` binary. Depends on core, schema, adapters and providers. |
| `@glossic/provider-claude-code` | `packages/providers/claude-code` | Completion via the Claude Code CLI. |
| `@glossic/provider-anthropic` | `packages/providers/anthropic` | Completion via the Anthropic API. |
| `@glossic/adapter-generic` | `packages/adapters/generic` | Language-agnostic fallback adapter. |
| `@glossic/adapter-treesitter` | `packages/adapters/treesitter` | Tree-sitter based extraction. |
| `@glossic/adapter-nestjs` | `packages/adapters/nestjs` | NestJS specific extraction. |

### Dependency rules

```
schema   -> (nothing)
core     -> schema
adapters -> schema
providers-> schema
cli      -> core, schema, adapters, providers
```

## Requirements

- Node >= 20
- pnpm >= 10

## Getting started

```bash
pnpm install
pnpm build
pnpm test
node packages/cli/dist/index.js --help
```

## Scripts

| Script | Description |
| --- | --- |
| `pnpm build` | Build every package with tsup (topological order). |
| `pnpm test` | Run vitest in every package. |
| `pnpm typecheck` | `tsc --noEmit` in every package. |
| `pnpm lint` | Biome check (lint + format). |
| `pnpm lint:fix` | Biome check with autofix. |
| `pnpm changeset` | Record a changeset. |

Set `GLOSSIC_DEBUG=1` to get stack traces instead of one-line CLI errors.

## CLI

```
glossic                    interactive menu (a terminal only)
glossic doctor             check node, providers, adapters, config
glossic scan [path]        analyze structure, no LLM
glossic generate [path]    generate documentation
glossic check [path]       validate whether the docs are stale
glossic init               create glossic.config.ts
```

### Interactive mode

`glossic` with no arguments opens a menu, above a status line that names the
project, the provider that answered and the language:

```
riqsi · claude-code connected · Spanish
```

Picking *Generate documentation* asks for the language and the output folder,
runs a **dry run** to show the plan and the token estimate, and only calls the
provider once you confirm. Every branch calls the same function the equivalent
flag would: the menu asks questions, it never reimplements the work.

**Without a terminal** — CI, a pipe, a script — `glossic` prints the help and
exits, exactly as it did before.

### Decoration

A banner is printed before every command, and `generate` shows live progress:
a counter, the unit in flight, a spinner, and one line per unit as it lands
with its outcome and its time.

All of it is suppressed when the output is not a TTY, when `--json` is passed,
or when `--quiet` is. Machine-readable output stays machine-readable.

The `--lang` default is the system language (`LC_ALL`, `LC_MESSAGES`, `LANG`,
`LANGUAGE`, then the runtime locale), falling back to English.

### `glossic doctor`

Run this first when something does not work. It reports the Node version, which
providers are usable and which one would be picked, the registered adapters and
whether a `glossic.config.ts` exists. **Exits 1 when no provider is available**,
with instructions for both ways to get one.

```
$ glossic doctor
glossic doctor

node        22.20.0
platform    win32-x64

providers
  ok       claude-code  <- would be used
  missing  anthropic

adapters    nestjs, treesitter, generic
config      none (glossic.config.ts not found)

Ready: `glossic generate` would use claude-code.
```

### `glossic scan`

Static analysis only: no LLM, no network, no markdown.

```
glossic scan [path]      workspace root, default "."
  --json                print the manifest to stdout instead of writing it
  --out <path>          manifest destination relative to the scanned root
                        (default: .glossic/manifest.json)
  --no-write            print the report only, write no file
```

It resolves the workspace (pnpm-workspace.yaml, package.json `workspaces`,
turbo.json, nx.json, lerna.json — in that order, falling back to a single
project at the root), groups each project's source files into units and writes
a manifest.

A **unit** is a directory that directly holds at least one source file; loose
files at a project root form a unit called `root`. Each unit carries its file
inventory, a language histogram, a folder-name `roleHint` (`controllers`,
`services`, `models`, `entities`, `dtos`, `routes`, `middleware`,
`components`, `hooks`, `utils`, `config`, `tests`) and a sha256 over the
sorted `(path, content digest)` pairs.

```
$ glossic scan ./examples/monorepo
example-monorepo — pnpm monorepo

@example/api (packages/api)
├─ src              1 file  typescript
├─ src/routes      2 files  typescript  routes
└─ src/services     1 file  typescript  services

@example/web (packages/web)
├─ src              1 file  tsx
├─ src/components  2 files  tsx         components
└─ src/hooks        1 file  typescript  hooks

2 projects, 6 units, 8 files
languages: typescript 5, tsx 3

manifest: examples/monorepo/.glossic/manifest.json
```

**The output is deterministic.** Every list is sorted, paths are posix, JSON is
indented with two spaces and no timestamp appears inside a unit. Two runs over
unchanged code produce byte-identical files apart from the top-level
`generatedAt`.

### `glossic generate`

Scans, then asks a provider to describe every unit and writes one markdown file
per unit, mirroring the source tree, plus a linked `index.md`.

```
glossic generate [path]    workspace root, default "."
  --dry-run               list the units and estimate tokens, call no provider
  --provider <name>       force claude-code or anthropic
  --out <dir>             docs destination; relative to the cwd, default <root>/docs
  --lang <code>           language of the documentation, default "en"
  --concurrency <n>       parallel completions, default 3
```

Each document carries frontmatter that Starlight and Docusaurus consume as-is:

```markdown
---
title: "src/users/dto"
unit: "root:src/users/dto"
project: "root"
path: "src/users/dto"
role: "dtos"
hash: "9f2c..."
files: 2
generatedAt: "2026-08-31T21:40:00.000Z"
---

# src/users/dto
...
```

The prompt hands the model the unit's facts plus the full text of its files and
asks for what the unit does, its responsibilities, its important public
elements and the architectural decisions visible in the code — with an explicit
ban on inventing anything that is not in the source.

#### Incremental cache

`generate` records what it wrote in `.glossic/cache.json`, one entry per unit:

```json
{
  "unitId": "root:src/users/dto",
  "unitHash": "9f2c…",
  "promptVersion": "1",
  "model": "default",
  "lang": "en",
  "outputPath": "src/users/dto.md",
  "generatedAt": "2026-08-31T21:40:00.000Z"
}
```

A unit is regenerated when its `unitHash`, `PROMPT_VERSION`, model or language
changed, or when its `.md` is gone. Everything else is served from cache
without touching the provider, and the run reports what that saved.

`PROMPT_VERSION` lives in `@glossic/core` and is bumped by hand whenever
`SYSTEM_PROMPT` changes. Bumping it invalidates every entry — that is what
keeps generated prose aligned with the prompt that produced it.

With no `model` pinned in the config the cache key is `"default"`, so glossic
cannot see the provider's own default drifting. Pin `model` if that matters.

#### Failures

`provider.complete()` is retried up to 3 times with exponential backoff
(500ms, 1s) and **only** for transient failures — `timeout`, `rate-limit`,
`server`. A refusal, a missing binary, a bad key or malformed output is never
repeated. A unit that still fails does not abort the run: it is reported in the
summary and `generate` exits `1`.

### `glossic check`

Compares the code against the documentation on disk. No provider, no writes —
this is the command a team puts in CI.

```
glossic check [path]       workspace root, default "."
  --json                  machine-readable output for CI
  --out <dir>             docs directory; relative to the cwd, default <root>/docs
```

It scans, reads the `hash` out of each document's frontmatter, and reports
three things: units with no document, documents written from older code, and
documents whose unit no longer exists.

```
$ glossic check
documentation is out of date

  stale     docs/src/utils.md     root:src/utils changed
  missing   docs/src/services.md  root:src/services is undocumented
  orphaned  docs/src/routes.md    no unit produces this file

3 problems, 2 units up to date

Regenerate the stale and missing documents with:

  glossic generate .

The cache regenerates exactly the units listed above.

Delete the orphaned documents:

  rm docs/src/routes.md
```

Exit `0` when everything is current, exit `1` otherwise.

## Keeping docs honest in CI

Run `glossic check` on every pull request. It needs no provider and no API key,
so it is cheap and cannot fail for credentials.

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

      # Exits 1 and names every file to regenerate when the docs drift.
      - name: glossic check
        run: pnpm exec glossic check
```

When the job fails, the fix is one command on the contributor's machine:

```bash
glossic generate          # the cache only regenerates what actually changed
git add docs .glossic/cache.json
```

Commit `.glossic/cache.json` alongside `docs/`: it is what lets the next
contributor regenerate one unit instead of the whole tree. `.glossic/manifest.json`
is a scan artifact and does not need to be committed.

## Configuration

`glossic init` writes a `glossic.config.ts` with every option, its real default
and one line on what it does. Every option in it has an effect — there are no
settings that only look configurable.

One precedence chain applies to all of them:

```
--flag  →  glossic.config.ts  →  saved preference  →  schema default
```

Only the keys a config file actually declares take part. A file that sets
nothing but `adapters` does not also start dictating the language: the value it
never wrote stays with whichever lower source owns it.

`glossic doctor` prints the resolved value and the origin of every option, which
is the fastest way to find out why glossic did something unexpected:

```
effective configuration
  adapters            default     nestjs, treesitter, generic
  concurrency         project     7
  lang                preference  it
  maxUnitFiles        project     4
  minUnitFiles        default     3
```

The saved preference lives in the per-user config directory — `%APPDATA%` on
Windows, `$XDG_CONFIG_HOME` or `~/.config` elsewhere — and is only written when
you change something from the interactive menu.

### Changing a grouping option invalidates the docs

`include`, `exclude`, `ignoreUnits`, `excludeFromContent`, `minUnitFiles`,
`maxUnitFiles` and `mergeChildrenInto` decide which files end up in which unit
and which of them the provider is shown. Change one and the affected units are
regenerated on the next run, because the unit hash covers **which bucket each
file landed in**, not just the file's path and contents. A change that happens
to regroup nothing costs nothing.

## Providers

| Provider | Requires | Notes |
| --- | --- | --- |
| `claude-code` | the `claude` CLI in PATH | Runs `claude -p --output-format json`; the prompt goes through **stdin**, never argv. Availability is probed once per process. |
| `anthropic` | `ANTHROPIC_API_KEY` | `@anthropic-ai/sdk`, default model `claude-opus-5`. |

`temperature` has no default: the recent Claude models (`claude-opus-5`,
`claude-sonnet-5`, `claude-fable-5`, `claude-opus-4-7/4-8`) reject sampling
parameters with a 400, so each provider decides whether to forward it.

### `claude-code` is slower than the API, by design

`claude -p` boots the whole coding agent before it answers, so a unit takes
seconds rather than hundreds of milliseconds. Its default timeout is **300s**,
against 120s for anything else. If you are documenting a large workspace and
have an API key, `--provider anthropic` finishes considerably sooner.

glossic also strips the agent back to a completion, because an agent answers
the operator instead of writing the document — one run produced a document
whose entire content was *"I've drafted the documentation but need write
permission to save it"*. Every call therefore runs with:

- `--allowed-tools ""` — no tools at all. The unit's files are already in the
  prompt; the model has no reason to touch a disk.
- `--setting-sources ""` and `--strict-mcp-config` — no user, project or local
  settings, no MCP servers.
- `--system-prompt` rather than `--append-system-prompt`, so glossic's
  instructions **replace** the agent persona instead of sitting under it.
- an empty temporary directory as the working directory, so the CLI never sees
  the scanned project's `CLAUDE.md` or `.claude/settings.json`.

### Output validation

Whatever the provider, the response is checked before it is written. A reply
that addresses the reader in the first person, asks a question, requests
permission, or is too short to be a document is rejected as
`invalid-content`. That failure is never retried — the same prompt gives the
same answer — but the unit is left out of the cache, so the next run tries it
again.

Resolution order: `--provider` → `provider` in the config → `claude-code` if
available → `anthropic` if a key is set → an error that explains both options.

Every provider failure is a typed `ProviderError` carrying a `code`
(`not-installed`, `unauthenticated`, `timeout`, `rate-limit`, `server`,
`exit-code`, `invalid-output`, `refused`, `api`) and, when there is one, the
underlying detail. Only `timeout`, `rate-limit` and `server` are retried.

## Notes

- `tsconfig.base.json` maps `@glossic/*` to package sources, and each package's
  `vitest.config.ts` mirrors those aliases. That is why `pnpm typecheck` and
  `pnpm test` work on a clean checkout, before `pnpm build` has produced any
  `dist/`. The published packages still resolve through `exports` -> `dist`.
- `pnpm -r` runs in topological order, so `@glossic/schema` is always built first.

## Examples

`examples/` holds small but realistic fixtures used by the test suite:

| Fixture | Shape |
| --- | --- |
| `nestjs-api` | modules with controller, service, dto, entity, middleware, config |
| `express-api` | routes, controllers, middleware, utils, entry file at the root |
| `laravel-api` | `app/Http/Controllers`, `app/Http/Middleware`, `app/Models`, `routes` |
| `monorepo` | `pnpm-workspace.yaml` + `packages/api` + `packages/web` |
