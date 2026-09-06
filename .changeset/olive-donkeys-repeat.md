---
"@glossic/core": minor
"glossic": minor
---

`glossic check` deja de tratar como huérfano cualquier `.md` del directorio de salida que no corresponda a una unit. Un archivo sólo es nuestro si lleva el frontmatter que escribe `renderUnitDoc` — `unit`, `hash` y `generatedAt` —, así que la documentación escrita a mano que viva en el mismo directorio ya no se menciona: ni como huérfana ni de ninguna otra forma. Un `.md` con nuestro frontmatter cuya unit ya no existe sigue reportándose, que es el caso para el que la categoría existe. **Esto cambia la salida de `check` en cualquier proyecto apuntado a un `docs/` con contenido propio: archivos que antes aparecían en el reporte dejan de aparecer, y un `check` que fallaba sólo por ellos ahora pasa.** `CheckResult.orphaned` nombra únicamente páginas que glossic escribió, tanto en el reporte como en `--json`.

El reporte ya no imprime una lista de `rm` lista para pegar. Los huérfanos se siguen nombrando en la tabla, con la razón `its unit no longer exists` / `su unit ya no existe` en lugar de `no unit produces this file`, y el bloque final explica que la unit que produjo esos archivos ya no existe y que se pueden borrar. Borrar sigue siendo una decisión de quien lee, no un comando en el portapapeles.

En el catálogo, `check.deleteOrphans` desaparece y entran `check.orphans.one` y `check.orphans.many`.
