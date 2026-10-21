import { AsyncLocalStorage } from 'node:async_hooks'
import type { Pool, PoolClient, QueryResultRow } from 'pg'

import type { TransactionRunner } from '@henko-software/hexagonal'

/** Lo mínimo para correr SQL: un `Pool` o un `PoolClient` de node-postgres. */
export type SqlExecutor = {
	query<R extends QueryResultRow = QueryResultRow>(
		text: string,
		values?: unknown[]
	): Promise<{ rows: R[]; rowCount: number | null }>
}

/**
 * Transacciones de Postgres que viajan con el contexto: adentro de
 * `run`, todo adaptador que pida `executor()` usa la misma conexión, así los
 * datos, la auditoría y el outbox se confirman o se descartan juntos. Un
 * `run` adentro de otro reusa la transacción de afuera.
 */
class PgTransactions implements TransactionRunner {
	private readonly storage = new AsyncLocalStorage<PoolClient>()

	constructor(private readonly pool: Pool) {}

	/** La conexión de la transacción en curso, o el pool si no hay. */
	executor(): SqlExecutor {
		return this.storage.getStore() ?? this.pool
	}

	/** ¿Hay una transacción en curso? */
	inTransaction(): boolean {
		return this.storage.getStore() !== undefined
	}

	async run<T>(work: () => Promise<T>): Promise<T> {
		if (this.inTransaction()) return work()
		const client = await this.pool.connect()
		try {
			await client.query('BEGIN')
			const result = await this.storage.run(client, work)
			await client.query('COMMIT')
			return result
		} catch (error) {
			await client.query('ROLLBACK')
			throw error
		} finally {
			client.release()
		}
	}
}

export { PgTransactions }
