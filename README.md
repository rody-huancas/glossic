# glosik

Monorepo scaffold for **glosik**, a documentation generator driven by static
analysis (adapters) plus optional LLM completion (providers).

> Status: scaffold only. Every command and adapter/provider method is a stub.

## Packages

| Package | Path | Description |
| --- | --- | --- |
| `@glosik/schema` | `packages/schema` | Zod schemas + inferred types. Depends on nothing in the repo. |
| `@glosik/core` | `packages/core` | Orchestration layer. Depends only on `@glosik/schema`. |
| `glosik` | `packages/cli` | The `glosik` binary. Depends on core, schema, adapters and providers. |
| `@glosik/provider-claude-code` | `packages/providers/claude-code` | Completion via the Claude Code CLI. |
| `@glosik/provider-anthropic` | `packages/providers/anthropic` | Completion via the Anthropic API. |
| `@glosik/adapter-generic` | `packages/adapters/generic` | Language-agnostic fallback adapter. |
| `@glosik/adapter-treesitter` | `packages/adapters/treesitter` | Tree-sitter based extraction. |
| `@glosik/adapter-nestjs` | `packages/adapters/nestjs` | NestJS specific extraction. |

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

## CLI

```
glosik scan [path]        analyze structure, no LLM
glosik generate [path]    generate documentation
glosik check              validate whether docs are stale
glosik init               create glosik.config.ts
```

All of them currently print `not implemented` and exit with code `0`.

## Notes

- `tsconfig.base.json` maps `@glosik/*` to package sources, and each package's
  `vitest.config.ts` mirrors those aliases. That is why `pnpm typecheck` and
  `pnpm test` work on a clean checkout, before `pnpm build` has produced any
  `dist/`. The published packages still resolve through `exports` -> `dist`.
- `pnpm -r` runs in topological order, so `@glosik/schema` is always built first.

## Examples

`examples/` holds empty placeholder fixtures: `nestjs-api`, `express-api`,
`laravel-api`, `monorepo`.
