import { type RequestContext, runWithContext } from '@henko-software/core'
import type {
	AuditRecord,
	AuditTrail,
	Clock,
	DomainEvent,
	EventPublisher,
	TransactionRunner
} from '@henko-software/hexagonal'

/** Auditoría en memoria: los tests revisan `entries`. */
class InMemoryAuditTrail<A extends string = string> implements AuditTrail<A> {
	readonly entries: AuditRecord<A>[] = []

	async record(entry: AuditRecord<A>): Promise<void> {
		this.entries.push(entry)
	}
}

/** Eventos en memoria: los tests revisan `events`. */
class InMemoryEventPublisher implements EventPublisher {
	readonly events: DomainEvent[] = []

	async publish(event: DomainEvent): Promise<void> {
		this.events.push(event)
	}
}

/** Mensajes del bus en memoria. Con `failNext` simula una caída del bus. */
class InMemoryMessageBus {
	readonly messages: {
		id: string
		subject: string
		data: string
		headers: Record<string, string>
	}[] = []
	failNext = 0

	async publish(message: InMemoryMessageBus['messages'][number]) {
		if (this.failNext > 0) {
			this.failNext--
			throw new Error('bus caído (simulado)')
		}
		this.messages.push(message)
	}
}

/** Transacción que no hace nada: corre el trabajo y listo. */
const immediateTransactions: TransactionRunner = { run: work => work() }

/** Reloj fijo para tests con fechas. */
const fixedClock = (iso: string): Clock => ({ now: () => new Date(iso) })

/** Contexto de prueba: una persona con rol `admin` en el local `local-1`. */
const TEST_CONTEXT: RequestContext = {
	actor: { origin: 'person', id: 'user-1', role: 'admin' },
	localId: 'local-1',
	correlationId: 'corr-1'
}

const withTestContext = <T>(
	work: () => T,
	overrides: Partial<RequestContext> = {}
): T => runWithContext({ ...TEST_CONTEXT, ...overrides }, work)

export {
	fixedClock,
	immediateTransactions,
	InMemoryAuditTrail,
	InMemoryEventPublisher,
	InMemoryMessageBus,
	TEST_CONTEXT,
	withTestContext
}
