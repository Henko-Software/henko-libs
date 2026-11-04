import { requireContext, uuidv7 } from '@henko-software/core'
import {
	type AuditRecord,
	type AuditTrail,
	diffFields,
	type EventPublisher
} from '@henko-software/hexagonal'
import type { SqlExecutor } from '@henko-software/pg'
import { currentTraceId } from '@henko-software/tracing'

export type PgAuditTrailOptions = {
	/** Devuelve la conexión de la transacción en curso (`PgTransactions.executor`). */
	executor: () => SqlExecutor
	/**
	 * Si viene, cada entrada sale también como evento `audit.entry.recorded.v1`
	 * (por el outbox), para que el servicio `audit` arme la línea de tiempo
	 * entre módulos.
	 */
	publisher?: EventPublisher
	/** Módulo que audita (`contacts`). Va en el evento. */
	source: string
	/**
	 * Guarda el «ver como» del superadmin en la columna `view_as` (hace falta
	 * `auditViewAsMigration`). Sin esto, la entrada queda igual a nombre del
	 * superadmin real, sin el rol simulado.
	 */
	recordViewAs?: boolean
}

/**
 * Auditoría en Postgres. El actor (con su rol congelado), el origen
 * persona/automático, el local, la traza y la correlación salen del contexto:
 * el caso de uso sólo dice qué pasó. El actor es siempre el real: en «ver
 * como», el superadmin (y el rol simulado va en `view_as`).
 */
class PgAuditTrail<A extends string = string> implements AuditTrail<A> {
	constructor(private readonly options: PgAuditTrailOptions) {}

	async record(entry: AuditRecord<A>): Promise<void> {
		const context = requireContext()
		const { actor } = context
		const { before, after } = diffFields(entry.before, entry.after)
		const row = {
			id: uuidv7(),
			action: entry.action,
			entityType: entry.entityType,
			entityId: entry.entityId,
			actorOrigin: actor.origin,
			actorId: actor.origin === 'person' ? actor.id : null,
			actorRole: actor.origin === 'person' ? actor.role : null,
			automationLabel: actor.origin === 'automatic' ? actor.label : null,
			localId: entry.localId ?? context.localId ?? null,
			before,
			after,
			traceId: currentTraceId() ?? null,
			correlationId: context.correlationId ?? null,
			...(this.options.recordViewAs ? { viewAs: context.viewAs ?? null } : {})
		}
		const viewAsColumn = this.options.recordViewAs ? ', view_as' : ''
		const viewAsParam = this.options.recordViewAs ? ', $14' : ''
		await this.options.executor().query(
			`INSERT INTO audit_log (id, action, entity_type, entity_id, actor_origin,
				actor_id, actor_role, automation_label, local_id, before, after,
				trace_id, correlation_id${viewAsColumn})
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13${viewAsParam})`,
			[
				row.id,
				row.action,
				row.entityType,
				row.entityId,
				row.actorOrigin,
				row.actorId,
				row.actorRole,
				row.automationLabel,
				row.localId,
				row.before === null ? null : JSON.stringify(row.before),
				row.after === null ? null : JSON.stringify(row.after),
				row.traceId,
				row.correlationId,
				...(this.options.recordViewAs
					? [context.viewAs ? JSON.stringify(context.viewAs) : null]
					: [])
			]
		)
		await this.options.publisher?.publish({
			type: 'audit.entry.recorded.v1',
			aggregateType: entry.entityType,
			aggregateId: entry.entityId,
			payload: { ...row, source: this.options.source }
		})
	}
}

export { PgAuditTrail }
