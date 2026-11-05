# henko-libs

El chasis de los servicios de Henko (módulos, orquestador, BFF). Lo que todo
servicio necesita y nadie tiene que volver a escribir: contexto del request,
errores con código para el usuario, logs, trazas, casos de uso hexagonales,
auditoría y outbox. Se publica como paquetes `@henko-software/*`.

| Paquete          | Qué trae                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core`           | contexto del request (actor con rol congelado, rol efectivo y «ver como», flags, local, correlación) que viaja solo por los `await`; `canSeeTrailOf`/`visibleTrail`/`visibleAuthor` (el rastro del superadmin sólo lo ve un superadmin); `uuidv7`; plata en centavos                                                                                  |
| `errors`         | `defineErrors` (catálogo con mensaje obligatorio), `toErrorResponse` (nunca muestra el error interno) y el código corto `H-4BF92F` que sale de la traza                                                                                                                                                                                               |
| `tracing`        | `withSpan`, `currentTraceId`, y la traza que viaja en las cabeceras de un mensaje                                                                                                                                                                                                                                                                     |
| `tracing-node`   | `initTracing`: OpenTelemetry con autoinstrumentación (HTTP, Postgres…) y envío OTLP                                                                                                                                                                                                                                                                   |
| `logger`         | pino en JSON con traza, actor, local y correlación en cada línea; CUIT, mails, tokens enmascarados                                                                                                                                                                                                                                                    |
| `hexagonal`      | `UseCase` (transacción + span con nombre), puertos `AuditTrail`, `EventPublisher`, `TransactionRunner`, `Clock`; `defineAuditActions`, `diffFields`                                                                                                                                                                                                   |
| `pg`             | `PgTransactions`: la transacción viaja con el contexto, así datos, auditoría y outbox se confirman juntos; `runMigrations`: migraciones `.sql` en orden, con checksum (frena si se edita una aplicada)                                                                                                                                                |
| `audit`          | `PgAuditTrail` + migración: append-only de verdad (sin UPDATE/DELETE para el rol del servicio)                                                                                                                                                                                                                                                        |
| `outbox`         | `PgOutboxPublisher` (el evento se guarda en la transacción), `OutboxRelay` (lo manda al bus, reintenta, en orden) y `NatsMessageBus` (JetStream, sin duplicados)                                                                                                                                                                                      |
| `service-auth`   | tokens internos entre servicios (Ed25519, 60 s, con audiencia): quién llama y en nombre de quién, en vez de cabeceras sueltas tipo `x-user-id`                                                                                                                                                                                                        |
| `service-client` | cliente HTTP entre servicios: token interno firmado con la audiencia del destino, timeout, respuesta validada con el contrato y el error del otro servicio con la misma clave (`createServiceClient`, `remoteError`, `toQuery`)                                                                                                                       |
| `nest`           | adaptadores de NestJS: middleware de contexto (default-deny, rutas públicas explícitas), filtro de errores con código y `parseInput` (zod, error por campo en castellano)                                                                                                                                                                             |
| `validation`     | los mensajes de zod en castellano, escritos para la persona (`spanishErrorMap`), y el error por campo (`fieldErrors`, `validate`). Único lugar de esos textos                                                                                                                                                                                         |
| `flags`          | feature flags en árbol: `resolveFlags` (código < env < base, herencia, superadmin sin flags; sólo en el BFF), `parseFlagList` (capa env) e `isFlagOn`/`requireFlag` para los módulos                                                                                                                                                                  |
| `files`          | puerto `FileStorage` (claves seguras, bytes + tipo): `LocalDiskFileStorage` (desarrollo), `S3FileStorage` (bucket S3-compatible, path-style, SigV4 sin el SDK de AWS), `MemoryFileStorage` (tests); `createFileStorage` con las variables `FILES_DRIVER`/`FILES_DIR`/`FILES_S3_*`; `fileFromDataUrl` y `sniffContentType` (el tipo sale de los bytes) |
| `mail`           | puerto `Mailer`: `logMailer` (desarrollo, no manda), `smtpMailer`, `memoryMailer` (tests, con fallas a pedido); `createMailer` con `MAIL_TRANSPORT`/`MAIL_SMTP_URL`/`MAIL_FROM`                                                                                                                                                                       |
| `testing`        | auditoría, eventos, bus, reloj y transacciones en memoria; `withTestContext`                                                                                                                                                                                                                                                                          |

## Cómo se usa en un servicio

```ts
// main.ts — lo primero, antes de importar Nest o pg
import { initTracing } from '@henko-software/tracing-node'

const stopTracing = initTracing({
	serviceName: 'identity',
	serviceVersion: '0.1.0',
	instance: process.env.HENKO_INSTANCE ?? 'dev'
})
```

```ts
// application/use-cases/createContact.ts
import {
	UseCase,
	type AuditTrail,
	type EventPublisher,
	type TransactionRunner
} from '@henko-software/hexagonal'

class CreateContact extends UseCase<ContactInput, Contact> {
	readonly name = 'contacts.create'

	constructor(
		tx: TransactionRunner,
		private readonly contacts: ContactRepository,
		private readonly audit: AuditTrail<ContactAction>,
		private readonly events: EventPublisher
	) {
		super(tx)
	}

	protected async handle(input: ContactInput) {
		const contact = Contact.create(input)
		await this.contacts.save(contact)
		await this.audit.record({
			action: 'contacts.contact.created',
			entityType: 'contact',
			entityId: contact.id,
			after: contact.snapshot()
		})
		await this.events.publish({
			type: 'contacts.contact.created.v1',
			aggregateType: 'contact',
			aggregateId: contact.id,
			payload: contact.snapshot()
		})
		return contact
	}
}
```

```ts
// main.ts — composición: qué adaptador va en cada puerto
const pool = new pg.Pool({ connectionString: env.DATABASE_URL })
const tx = new PgTransactions(pool)
const events = new PgOutboxPublisher(tx)
const audit = new PgAuditTrail({
	executor: () => tx.executor(),
	publisher: events,
	source: 'contacts'
})
const relay = new OutboxRelay({
	transactions: tx,
	bus: new NatsMessageBus(nc.jetstream())
})
relay.start()
```

El BFF o el consumidor de eventos envuelve cada request con
`runWithContext({ actor, localId, correlationId }, …)`. En un servicio Nest,
`createContextMiddleware` con `internalTokenResolver` lo hace solo, y
`HenkoErrorFilter` da a todos los errores la misma forma.

## Flags, «ver como» y rastro del superadmin

Ver `estandares/flags-y-ver-como.md` de `@henko-software/agent-rules`.

- **El BFF resuelve, los módulos leen.** El BFF llama a
  `resolveFlags(catalogo, { defaults, env, base }, contexto)` una vez por
  request y pone el resultado en `context.flags`, que viaja en el token
  interno. En un módulo, `requireFlag('orders.returns')` al principio del
  caso de uso (404 si está apagado) o `isFlagOn(...)` para decidir algo. Un
  módulo nunca lee la tabla de flags.
- **Dos caras del actor.** `context.actor` es siempre la persona real (va a
  la auditoría y a los logs); `context.effective` (rol, persona y locales) es
  con qué se la trata cuando un superadmin «ve como». Permisos y scope con
  `effectiveRole(context)` o `context.effective`; nunca con `actor.role` a
  secas. Un efectivo sólo vale si el actor real es superadmin.
- **Auditoría en «ver como».** Queda a nombre del superadmin real; con
  `auditViewAsMigration()` + `recordViewAs: true`, el rol simulado va en la
  columna `view_as`.
- **Rastro del superadmin.** Todo lo que muestre quién hizo algo (filas de
  auditoría, «creado/editado por», historiales, avisos) pasa por
  `visibleTrail(filas, fila => fila.actorRole)` o
  `visibleAuthor(autor, rolDelAutor)`, con el rol congelado del autor real.
  Sólo un superadmin real sin «ver como» lo ve.

## Desarrollo

Requisitos: Node 22, pnpm 9 y `NODE_AUTH_TOKEN` con `read:packages` (ver
`henko-standards`).

| Comando          | Qué hace                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm test`      | tests; los de Postgres y NATS corren si existen `HENKO_TEST_DATABASE_URL` y `HENKO_TEST_NATS_URL` |
| `pnpm check`     | formato + lint                                                                                    |
| `pnpm typecheck` | tipos (entre paquetes usa el código fuente, sin build)                                            |
| `pnpm build`     | compila cada paquete a `dist/`                                                                    |

Con el entorno de `henko-infra` levantado, o con contenedores sueltos:

```bash
docker run -d --rm --name henko-libs-pg -e POSTGRES_USER=henko -e POSTGRES_PASSWORD=henko -e POSTGRES_DB=henko_test -p 127.0.0.1:5499:5432 postgres:16-alpine
docker run -d --rm --name henko-libs-nats -p 127.0.0.1:4299:4222 nats:2.10-alpine -js
HENKO_TEST_DATABASE_URL=postgres://henko:henko@127.0.0.1:5499/henko_test \
HENKO_TEST_NATS_URL=nats://127.0.0.1:4299 pnpm test
```

## Publicar

Subir el `version` del paquete y llegar a `main`: `release.yml` publica lo
que tenga versión nueva.

**Ojo con las versiones 0.x.** En 0.x, `^0.1.0` no acepta la `0.2.0`. Si un
paquete sube el número del medio (`0.1.x` → `0.2.0`), hay que subir también
el parche de **todos los paquetes que dependen de él**, para que se publiquen
de nuevo apuntando a la versión nueva. Si no, un servicio termina con dos
copias del mismo paquete: por ejemplo, dos `PgTransactions` que no son el
mismo tipo, y el typecheck falla. Para ver quién depende de un paquete:
`grep -l '"@henko-software/<paquete>"' packages/*/package.json`.
