import type { PgTransactions } from '@henko-software/pg'
import { withRemoteContext, withSpan } from '@henko-software/tracing'

import type { MessageBus } from './bus.js'

type OutboxRow = {
	id: string
	type: string
	payload: unknown
	headers: Record<string, string>
}

export type OutboxRelayOptions = {
	transactions: PgTransactions
	bus: MessageBus
	/** Eventos por vuelta. */
	batchSize?: number
	/** Espera entre vueltas cuando no hubo nada que mandar (ms). */
	idleMs?: number
	/** Para avisar fallos (el logger del servicio). */
	onError?: (error: unknown, eventId: string) => void
}

/**
 * Manda al bus los eventos pendientes del outbox, en orden. Varias copias del
 * servicio pueden correrlo a la vez: cada una toma filas distintas
 * (`FOR UPDATE SKIP LOCKED`). Si el bus falla, el evento queda pendiente con
 * el error y se reintenta en la próxima vuelta.
 */
class OutboxRelay {
	private timer: NodeJS.Timeout | undefined
	private running = false

	constructor(private readonly options: OutboxRelayOptions) {}

	/** Una vuelta: devuelve cuántos eventos mandó. */
	runOnce(): Promise<number> {
		const { transactions, bus, batchSize = 50, onError } = this.options
		return transactions.run(async () => {
			const executor = transactions.executor()
			const { rows } = await executor.query<OutboxRow>(
				`SELECT id, type, payload, headers FROM outbox
				WHERE published_at IS NULL
				ORDER BY occurred_at, id
				LIMIT $1
				FOR UPDATE SKIP LOCKED`,
				[batchSize]
			)
			let sent = 0
			for (const row of rows) {
				try {
					await withRemoteContext(row.headers, () =>
						withSpan(`outbox publish ${row.type}`, () =>
							bus.publish({
								id: row.id,
								subject: row.type,
								data: JSON.stringify(row.payload),
								headers: row.headers
							})
						)
					)
					await executor.query(
						'UPDATE outbox SET published_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1',
						[row.id]
					)
					sent++
				} catch (error) {
					onError?.(error, row.id)
					await executor.query(
						'UPDATE outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1',
						[row.id, error instanceof Error ? error.message : String(error)]
					)
					// Se corta la vuelta: el orden importa más que la velocidad.
					break
				}
			}
			return sent
		})
	}

	/** Corre en loop hasta `stop()`. */
	start(): void {
		if (this.running) return
		this.running = true
		const loop = async () => {
			if (!this.running) return
			let sent = 0
			try {
				sent = await this.runOnce()
			} catch (error) {
				this.options.onError?.(error, '')
			}
			if (this.running) {
				this.timer = setTimeout(
					loop,
					sent > 0 ? 0 : (this.options.idleMs ?? 500)
				)
			}
		}
		void loop()
	}

	stop(): void {
		this.running = false
		if (this.timer) clearTimeout(this.timer)
	}
}

export { OutboxRelay }
