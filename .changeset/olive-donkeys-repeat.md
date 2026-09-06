---
"@glossic/core": minor
"glossic": minor
---

`glossic check` deja de tratar como huérfano cualquier `.md` del directorio de salida que no corresponda a una unit. Un archivo sólo es nuestro si lleva el frontmatter que escribe `renderUnitDoc` — `unit`, `hash` y `generatedAt` —, así que la documentación escrita a mano que viva en el mismo directorio ya no se menciona: ni como huérfana ni de ninguna otra forma. Un `.md` con nuestro frontmatter cuya unit ya no existe sigue reportándose, que es el caso para el que la categoría existe. **Esto cambia la salida de `check` en cualquier proyecto apuntado a un `docs/` con contenido propio: archivos que antes aparecían en el reporte dejan de aparecer, y un `check` que fallaba sólo por ellos ahora pasa.** `CheckResult.orphaned` nombra únicamente páginas que glossic escribió, tanto en el reporte como en `--json`.

El reporte ya no imprime una lista de `rm` lista para pegar. Los huérfanos se siguen nombrando en la tabla, con la razón `its unit no longer exists` / `su unit ya no existe` en lugar de `no unit produces this file`, y el bloque final explica que la unit que produjo esos archivos ya no existe y que se pueden borrar. Borrar sigue siendo una decisión de quien lee, no un comando en el portapapeles.

El directorio de páginas generadas se llama `--docs` en todos los comandos que lo leen. `glossic check` pasa a aceptar `--docs`, igual que `glossic eject`, y `--out` queda reservado para destinos de escritura: la salida de `generate`, el sitio de `eject` y el manifest de `scan`. `check --out` sigue funcionando como alias obsoleto, imprimiendo una línea en stderr que dice que el flag se movió, y se quitará en un major. Si `--docs` y `--out` vienen juntos, gana `--docs`. El README lo documenta en «`--docs` reads, `--out` writes».

`glossic check` resuelve el directorio de páginas con la misma precedencia que ya usaban `generate` y `eject`: el flag, después el directorio que la última corrida de `generate` dejó anotado en el manifest, después `output.dir`. **Generar en `docs-walearning` y correr `check` sin flags ahora lee `docs-walearning`; antes miraba `docs` y daba todas las páginas por faltantes.** En el menú interactivo, "check" recibe el directorio elegido en la sesión igual que "eject", así que generar en una carpeta y comprobar a continuación ya no mira dos sitios distintos. `resolveDocsDir` se muda de `commands/eject/` a `src/docs-dir.ts`, que es de donde lo toman ahora los tres.

En el catálogo, `check.deleteOrphans` desaparece y entran `check.orphans.one`, `check.orphans.many` y `check.outDeprecated`.
