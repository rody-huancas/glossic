# @glossic/schema

## 0.5.0

### Minor Changes

- 2626530: El scan pasa a tener dos capas: un adapter base construye los units y N enrichers los recorren después para añadirles facts. `@glossic/schema` suma `Enricher`, `EnrichContext`, `EnrichResult`, `UnitEnrichment`, `Layer`, `isAdapter` e `isEnricher`; `@glossic/core` suma `selectAdapter`, `selectEnrichers` y `applyEnrichment`, y `ScanResult` gana `enrichersByProject`. `PipelineContext.adapters`, `orderAdapters` y `AdapterRegistry` pasan de `Adapter` a `Layer`. Un enricher nunca crea, borra ni renombra un unit, y no toca `facts.base` ni el hash: la forma del manifest sigue siendo la del adapter base.

  `@glossic/adapter-treesitter` deja de ser un stub y se implementa como enricher para TypeScript, JavaScript, JSX y TSX. Puebla `facts.symbols` con los símbolos exportados de cada unit — clases, interfaces, tipos, enums, funciones, constantes y los métodos públicos de las clases e interfaces exportadas, con su firma y su línea — y emite relations `imports` entre units para los imports relativos, con `weight`. Trae `web-tree-sitter@0.25.10` como dependencia nueva y vendoriza las tres gramáticas `.wasm` (3.3 MB sin comprimir, 355 KB en el tarball). Los `import()` dinámicos, los `require()` y los alias de `tsconfig` no producen aristas todavía.

  `**/__fixtures__/**` entra en el default de `ignoreUnits`, junto a `testdata/` y `mocks/`. Si tu proyecto tiene un directorio con ese nombre dentro del árbol escaneado, sus archivos pasan de `files` a `ignoredFiles` y el hash de ese unit se mueve, así que la primera corrida regenera esa página. Quítalo con `ignoreUnits: ["-**/__fixtures__/**"]` si lo querías documentado.

  El default de `exclude` suma `**/.astro/**`, `**/.docusaurus/**`, `**/.vitepress/cache/**` y `**/docs-site/**`: los cachés de los generadores de sitios de documentación, y el scaffold que escribe `glossic eject`. Glossic no debe documentar su propia salida. **Esto mueve hashes en cualquier proyecto que hoy tenga un `.astro/` o un `docs-site/` dentro del árbol escaneado**, así que la primera corrida marca esas páginas como stale y las regenera. Si alguno de esos nombres es tuyo, recupéralo con el prefijo `-`, por ejemplo `exclude: ["-**/docs-site/**"]`.

  `glossic eject` avisa cuando `--out` apunta a un directorio que el default no cubre, e imprime la línea de `exclude` exacta a añadir.

  El prompt cambia y `PROMPT_VERSION` sube a `"5"`. **Eso marca stale toda la documentación existente: la siguiente corrida de `generate` regenera cada página, con el coste en tokens que eso supone en un repo grande.** Vale la pena: los símbolos entraban al prompt como una lista completa de nombres — 92 en un solo unit de este repo — que el modelo trataba como un índice a rellenar, y el análisis se resentía. Ahora entran como la forma de la superficie (`exported surface: 92 symbols — 30 const, 29 type, …`), un 91% más corta y sin un solo nombre que catalogar. En paralelo, el system prompt pide que la sección de elementos públicos sea selectiva en vez de exhaustiva, y nombra lo que la sección de decisiones debe buscar: contratos declarados que la implementación no cumple, dependencias usadas y no declaradas, datos perdidos sin aviso, trabajo hecho dos veces, y estado que no sobrevive a un reinicio o a una segunda instancia — con la instrucción explícita de callar antes que inventar un hallazgo. También deja de citar los Facts en el documento, y cambia la prohibición de listar archivos por una condición: un mapa de archivos vale si cada entrada dice para qué sirve el archivo, porque la página publicada no lleva ningún listado propio.

  El reporte de `glossic scan` cierra la línea de resumen con los enrichers que corrieron y cuántos símbolos aportó cada uno.

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

- 00b36b5: Defaults que dejan de asumir JS/TS

  `exclude`, `ignoreUnits`, `excludeFromContent`, la deteccion de lenguaje y los
  roleHint solo conocian convenciones de JS/TS. Ahora cubren .NET, Python, Go,
  Java/Kotlin, PHP/Laravel, Rust y Ruby/Rails.

  - `exclude` pasa a ser una sola cosa: lo que emite tu propio build (`obj`,
    `__pycache__`, `.gradle`, `out`, `tmp`, `storage/framework`...), y es tuyo
    para reemplazar. Lo que no es codigo tuyo — `node_modules`, `vendor`,
    `.venv`, `site-packages` y el VCS — es el `HARD_IGNORES` del adapter y no se
    configura. Antes los dos listaban lo mismo.
  - `ignoreUnits` cubre codigo generado, migraciones y artefactos de cada
    ecosistema, y se compara **sin distinguir mayusculas**, para que
    `Migrations/` de .NET llegue al mismo patron que `migrations/`.
  - `excludeFromContent` reconoce las convenciones de test de cada ecosistema
    (`tests/`, `spec/`, `*_test.go`, `test_*.py`, `*_spec.rb`...).
  - `RoleHint` gana `repositories` y `jobs`, que aparecen en cinco de los siete
    ecosistemas y antes se perdian como `services`.

  Dos cambios de comportamiento a tener en cuenta: un fichero bajo `tests/`,
  `test/` o `spec/` deja de documentarse como codigo de produccion, y una
  configuracion que redefine `exclude` reemplaza la lista entera, asi que hay que
  copiar las entradas que se quieran conservar.

- 2d78eee: BREAKING: exclude, ignoreUnits y excludeFromContent ahora se suman al default en vez de reemplazarlo. Usa el prefijo `-` para quitar una entrada. Si tienes listas propias, la primera corrida regenera todo porque los hashes se mueven.

  Soporte de convenciones para .NET, Python, Go, Java/Kotlin, PHP/Laravel, Rust y Ruby: artefactos de build excluidos, roles reconocidos, y matching insensible a mayúsculas (antes PascalCase rompía .NET, Java y Laravel).

  GROUPING_KEYS eliminado de la API pública de @glossic/core.

## 0.3.0

### Minor Changes

- 1d6fca4: Parar generate cuando el proveedor se queda sin cuota, sin sesion o sin binario, avisar antes de un plan grande y poder generarlo por proyecto, mas correcciones en el sitio de eject, los plurales del CLI y la carpeta que propone el menu

## 0.2.0

### Minor Changes

- a7553b9: Nuevo comando eject para generar sitio Astro/Starlight, y correcciones en init, deteccion de config y agrupamiento de units

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
