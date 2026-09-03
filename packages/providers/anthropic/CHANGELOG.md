# @glossic/provider-anthropic

## 0.2.0

### Minor Changes

- a7553b9: Nuevo comando eject para generar sitio Astro/Starlight, y correcciones en init, deteccion de config y agrupamiento de units

### Patch Changes

- Updated dependencies [a7553b9]
  - @glossic/schema@0.2.0

## 0.1.0

### Minor Changes

- 0a2fb27: First release.

  `glossic scan` resolves the workspace — pnpm, npm workspaces, turbo, nx, lerna,
  or a single project — groups each project's source files into units and writes a
  manifest. Every list is sorted and every path is posix, so two runs over
  unchanged code produce the same bytes apart from the top-level `generatedAt`.

  `glossic generate` sends one prompt per unit and writes a markdown page per
  unit, mirroring the source tree, with the unit hash in the frontmatter. What it
  wrote is recorded in `.glossic/cache.json`, so a later run only pays for the
  units whose files, prompt version, model or language actually changed.

  `glossic check` compares the code against the pages on disk and exits 1 when any
  is missing, stale or orphaned. It calls no provider and needs no key, which is
  what makes it cheap to run on every pull request.

  `glossic doctor` reports what the machine has and exits 1 when nothing can write
  prose. `glossic init` writes a `glossic.config.ts` with every option at its
  default.

  Running `glossic` with no arguments opens a menu that wipes the screen between
  actions, can be backed out of at any prompt, and carries a Connection submenu
  for pinning a provider or storing an API key. Without a terminal it prints the
  help instead.

  Two providers, detected automatically: `claude-code`, which uses an existing
  Claude subscription and needs no API key, and `anthropic`, which needs
  `ANTHROPIC_API_KEY`. A provider failure is typed, and only a timeout, a rate
  limit or a server error is retried. A reply that talks to the reader instead of
  documenting the code is rejected rather than written.

  One adapter does the work today: `generic`, which is language-agnostic and
  reports what a file's path, size and extension can tell. `nestjs` and
  `treesitter` are registered but claim nothing yet, so `generic` handles
  everything.

  The interface speaks English and Spanish, following the system locale.

### Patch Changes

- Updated dependencies [0a2fb27]
  - @glossic/schema@0.1.0
