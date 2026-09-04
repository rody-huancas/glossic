---
"@glossic/adapter-generic": minor
"@glossic/schema": minor
"glossic": minor
---

Defaults que dejan de asumir JS/TS

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
