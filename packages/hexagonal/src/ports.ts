/**
 * Puertos que comparten todos los módulos. Los casos de uso hablan con estas
 * interfaces; los adaptadores (Postgres, NATS, memoria) las implementan.
 */

/** Una entrada de auditoría. El actor y la traza los pone el adaptador. */
export type AuditRecord<A extends string = string> = {
	/** Del catálogo del módulo (`defineAuditActions`). */
	action: A
	entityType: string
	entityId: string
	/** Estado antes del cambio. Se guardan sólo los campos que cambiaron. */
	before?: Record<string, unknown> | null
	after?: Record<string, unknown> | null
	/** Si no viene, el del contexto del request. */
	localId?: string
}

export interface AuditTrail<A extends string = string> {
	record(entry: AuditRecord<A>): Promise<void>
}

/** Un hecho de negocio: `contacts.contact.created.v1`. */
export type DomainEvent<P = unknown> = {
	type: string
	aggregateType: string
	aggregateId: string
	payload: P
}

export interface EventPublisher {
	publish(event: DomainEvent): Promise<void>
}

/**
 * Una operación de negocio = una transacción. Lo que se escriba adentro
 * (datos, auditoría, eventos del outbox) se confirma o se descarta junto.
 */
export interface TransactionRunner {
	run<T>(work: () => Promise<T>): Promise<T>
}

export interface Clock {
	now(): Date
}

export const systemClock: Clock = { now: () => new Date() }
