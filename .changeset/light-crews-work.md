---
"@glossic/adapter-generic": minor
"@glossic/schema": minor
"@glossic/core": minor
"glossic": minor
---

BREAKING: exclude, ignoreUnits y excludeFromContent ahora se suman al default en vez de reemplazarlo. Usa el prefijo `-` para quitar una entrada. Si tienes listas propias, la primera corrida regenera todo porque los hashes se mueven.

Soporte de convenciones para .NET, Python, Go, Java/Kotlin, PHP/Laravel, Rust y Ruby: artefactos de build excluidos, roles reconocidos, y matching insensible a mayúsculas (antes PascalCase rompía .NET, Java y Laravel).

GROUPING_KEYS eliminado de la API pública de @glossic/core.
