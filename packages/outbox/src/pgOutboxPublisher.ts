import { getContext, uuidv7 } from '@henko-software/core'
import type { DomainEvent, EventPublisher } from '@henko-software/hexagonal'
import type { PgTransactions } from '@henko-software/pg'
import { injectTraceHeaders } from '@henko-software/tracing'

/**
 * Publica eventos guardándolos en el outbox, en la misma transacción que el
 * cambio: si la operación se descarta, el evento también. Nunca se pierde un
 * evento ni sale uno de algo que no pasó. El relay los manda al bus después.
 */
class PgOutboxPublisher implements EventPublisher {
	constructor(private readonly transactions: PgTransactions) {}

	async publish(event: DomainEvent): Promise<void> {
		if (!this.transactions.inTransaction()) {
			throw new Error(
				`El evento ${event.type} se publica fuera de una transacción: corré el caso de uso con un TransactionRunner.`
			)
		}
		const context = getContext()
		const headers: Record<string, string> = {
			...injectTraceHeaders(),
			...(context?.correlationId
				? { 'henko-correlation-id': context.correlationId }
				: {}),
			...(context?.causationId
				? { 'henko-causation-id': context.causationId }
				: {}),
			...(context?.localId ? { 'henko-local-id': context.localId } : {})
		}
		await this.transactions.executor().query(
			`INSERT INTO outbox (id, type, aggregate_type, aggregate_id, payload, headers)
				VALUES ($1, $2, $3, $4, $5, $6)`,
			[
				uuidv7(),
				event.type,
				event.aggregateType,
				event.aggregateId,
				JSON.stringify(event.payload),
				JSON.stringify(headers)
			]
		)
	}
}

export { PgOutboxPublisher }
