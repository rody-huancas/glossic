---
"@glossic/adapter-treesitter": minor
"@glossic/schema": minor
"@glossic/core": minor
"glossic": minor
---

El scan pasa a tener dos capas: un adapter base construye los units y N enrichers los recorren después para añadirles facts. `@glossic/schema` suma `Enricher`, `EnrichContext`, `EnrichResult`, `UnitEnrichment`, `Layer`, `isAdapter` e `isEnricher`; `@glossic/core` suma `selectAdapter`, `selectEnrichers` y `applyEnrichment`, y `ScanResult` gana `enrichersByProject`. `PipelineContext.adapters`, `orderAdapters` y `AdapterRegistry` pasan de `Adapter` a `Layer`. Un enricher nunca crea, borra ni renombra un unit, y no toca `facts.base` ni el hash: la forma del manifest sigue siendo la del adapter base.

`@glossic/adapter-treesitter` deja de ser un stub y se implementa como enricher para TypeScript, JavaScript, JSX y TSX. Puebla `facts.symbols` con los símbolos exportados de cada unit — clases, interfaces, tipos, enums, funciones, constantes y los métodos públicos de las clases e interfaces exportadas, con su firma y su línea — y emite relations `imports` entre units para los imports relativos, con `weight`. Trae `web-tree-sitter@0.25.10` como dependencia nueva y vendoriza las tres gramáticas `.wasm` (3.3 MB sin comprimir, 355 KB en el tarball). Los `import()` dinámicos, los `require()` y los alias de `tsconfig` no producen aristas todavía.

`**/__fixtures__/**` entra en el default de `ignoreUnits`, junto a `testdata/` y `mocks/`. Si tu proyecto tiene un directorio con ese nombre dentro del árbol escaneado, sus archivos pasan de `files` a `ignoredFiles` y el hash de ese unit se mueve, así que la primera corrida regenera esa página. Quítalo con `ignoreUnits: ["-**/__fixtures__/**"]` si lo querías documentado.

El default de `exclude` suma `**/.astro/**`, `**/.docusaurus/**`, `**/.vitepress/cache/**` y `**/docs-site/**`: los cachés de los generadores de sitios de documentación, y el scaffold que escribe `glossic eject`. Glossic no debe documentar su propia salida. **Esto mueve hashes en cualquier proyecto que hoy tenga un `.astro/` o un `docs-site/` dentro del árbol escaneado**, así que la primera corrida marca esas páginas como stale y las regenera. Si alguno de esos nombres es tuyo, recupéralo con el prefijo `-`, por ejemplo `exclude: ["-**/docs-site/**"]`.

`glossic eject` avisa cuando `--out` apunta a un directorio que el default no cubre, e imprime la línea de `exclude` exacta a añadir.

El prompt cambia y `PROMPT_VERSION` sube a `"5"`. **Eso marca stale toda la documentación existente: la siguiente corrida de `generate` regenera cada página, con el coste en tokens que eso supone en un repo grande.** Vale la pena: los símbolos entraban al prompt como una lista completa de nombres — 92 en un solo unit de este repo — que el modelo trataba como un índice a rellenar, y el análisis se resentía. Ahora entran como la forma de la superficie (`exported surface: 92 symbols — 30 const, 29 type, …`), un 91% más corta y sin un solo nombre que catalogar. En paralelo, el system prompt pide que la sección de elementos públicos sea selectiva en vez de exhaustiva, y nombra lo que la sección de decisiones debe buscar: contratos declarados que la implementación no cumple, dependencias usadas y no declaradas, datos perdidos sin aviso, trabajo hecho dos veces, y estado que no sobrevive a un reinicio o a una segunda instancia — con la instrucción explícita de callar antes que inventar un hallazgo. También deja de citar los Facts en el documento, y cambia la prohibición de listar archivos por una condición: un mapa de archivos vale si cada entrada dice para qué sirve el archivo, porque la página publicada no lleva ningún listado propio.

El reporte de `glossic scan` cierra la línea de resumen con los enrichers que corrieron y cuántos símbolos aportó cada uno.
