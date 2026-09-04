---
"@glossic/adapter-generic": minor
"@glossic/schema": minor
"@glossic/core": minor
"glossic": minor
---

`exclude`, `ignoreUnits` y `excludeFromContent` ahora suman en vez de reemplazar

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
    "**/legacy/**",   // se anade al default
    "-**/out/**",     // descarta esa entrada del default
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
