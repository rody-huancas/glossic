# @glossic/core

## 0.4.0

### Minor Changes

- a4c4beb: `exclude`, `ignoreUnits` y `excludeFromContent` ahora suman en vez de reemplazar

  **Esto cambia la semantica de las configs existentes. Si tu `glossic.config.ts`
  define alguna de esas tres listas, la primera ejecucion tras actualizar
  regenera la documentacion entera: la lista resuelta cambia, con ella cambia en
  que unidad cae cada fichero, y con ella los hashes. `glossic check` marcara todo
  como desactualizado una vez, y `generate` lo reescribira. Presupuesta esa
  pasada.**

  Con 29 patrones por defecto, reemplazar la lista entera era una trampa: quien
  queria anadir uno perdia los otros 28 sin enterarse. Ahora:

  ```ts
  export default {
    exclude: [
      "**/legacy/**", // se anade al default
      "-**/out/**", // descarta esa entrada del default
    ],
  };
  ```

  - Un patron sin prefijo se anade. Uno con `-` descarta esa entrada del default.
    `\-` escapa un patron que de verdad empieza por guion.
  - Una resta que no coincide con ningun default se avisa por stderr en `scan`,
    `generate` y `check`, en vez de no hacer nada en silencio.
  - `glossic doctor` imprime las tres listas resueltas, un patron por linea,
    marcado `default`, `added` o `removed`.
  - `include` y `adapters` siguen reemplazando: uno es un solo glob y el otro es
    una lista de prioridad ordenada, donde fusionar seria incorrecto.

  No hay modo de reemplazo total. Si de verdad no quieres ninguno de los
  defaults, restalos uno a uno.

  `GROUPING_KEYS`, exportado desde `@glossic/core` y sin ningun consumidor, se
  elimina. La invalidacion al cambiar una opcion de agrupacion sigue ocurriendo
  por el hash de unidad, que cubre en que bucket cayo cada fichero.

- 2d78eee: BREAKING: exclude, ignoreUnits y excludeFromContent ahora se suman al default en vez de reemplazarlo. Usa el prefijo `-` para quitar una entrada. Si tienes listas propias, la primera corrida regenera todo porque los hashes se mueven.

  Soporte de convenciones para .NET, Python, Go, Java/Kotlin, PHP/Laravel, Rust y Ruby: artefactos de build excluidos, roles reconocidos, y matching insensible a mayúsculas (antes PascalCase rompía .NET, Java y Laravel).

  GROUPING_KEYS eliminado de la API pública de @glossic/core.

### Patch Changes

- Updated dependencies [a4c4beb]
- Updated dependencies [00b36b5]
- Updated dependencies [2d78eee]
  - @glossic/schema@0.4.0

## 0.3.0

### Minor Changes

- 1d6fca4: Parar generate cuando el proveedor se queda sin cuota, sin sesion o sin binario, avisar antes de un plan grande y poder generarlo por proyecto, mas correcciones en el sitio de eject, los plurales del CLI y la carpeta que propone el menu

### Patch Changes

- Updated dependencies [1d6fca4]
  - @glossic/schema@0.3.0

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
