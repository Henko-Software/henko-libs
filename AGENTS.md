# henko-libs

Monorepo de librerías: el chasis de los servicios de Henko. Cada carpeta de
`packages/` se publica como `@henko-software/<nombre>`. Ver el README para
qué trae cada una.

Las reglas generales están en `@henko-software/agent-rules` (las importa el
`CLAUDE.md`). Acá va sólo lo propio.

## Lo propio de este repo

- **Sin frameworks en las librerías.** Nada de Nest, Drizzle ni Express acá:
  los adaptadores de un framework van en el servicio o en un paquete aparte.
  `hexagonal` sólo depende de `tracing` (la API de OpenTelemetry).
- **Imports relativos con `.js`** (ESM NodeNext): `./errors.js`.
- **Entre paquetes, código fuente**: `tsconfig.base.json` usa la condición
  `henko-source` y `vitest.config.ts` tiene alias; no hace falta build para
  typecheck ni tests. Lo publicado es `dist/`.
- **Tests de integración** contra Postgres y NATS reales: corren con
  `HENKO_TEST_DATABASE_URL` y `HENKO_TEST_NATS_URL` (ver README). El CI levanta
  Postgres; NATS por ahora sólo en local.
- **Un cambio que rompe** a quien usa un paquete sube el mayor de ese paquete.
- Todo mensaje que ve el usuario (catálogo de errores, nombres de acciones de
  auditoría) en español; identificadores en inglés.
