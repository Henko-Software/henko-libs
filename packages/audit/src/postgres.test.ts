import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
	outboxMigration,
	OutboxRelay,
	PgOutboxPublisher
} from '@henko-software/outbox'
import { PgTransactions } from '@henko-software/pg'
import { InMemoryMessageBus, withTestContext } from '@henko-software/testing'

import { auditLogMigration, PgAuditTrail } from './index.js'

/**
 * Integración contra un Postgres de verdad. Corre si existe
 * HENKO_TEST_DATABASE_URL (el CI lo pone con `postgres: true`; en local,
 * cualquier base vacía). Si no, se saltea.
 */
const url = process.env.HENKO_TEST_DATABASE_URL

describe.skipIf(!url)('auditoría y outbox en Postgres', () => {
	let pool: pg.Pool
	let tx: PgTransactions
	let audit: PgAuditTrail<'contacts.contact.created'>
	let outbox: PgOutboxPublisher

	const count = async (table: string) =>
		Number(
			(await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))
				.rows[0]?.n
		)

	const createContact = (name: string, fail = false) =>
		withTestContext(() =>
			tx.run(async () => {
				const id = `c-${name}`
				await tx
					.executor()
					.query('INSERT INTO contacts (id, name) VALUES ($1, $2)', [id, name])
				await audit.record({
					action: 'contacts.contact.created',
					entityType: 'contact',
					entityId: id,
					after: { name }
				})
				await outbox.publish({
					type: 'contacts.contact.created.v1',
					aggregateType: 'contact',
					aggregateId: id,
					payload: { id, name }
				})
				if (fail) throw new Error('falla después de escribir')
			})
		)

	beforeAll(async () => {
		pool = new pg.Pool({ connectionString: url })
		await pool.query(`
			DROP TABLE IF EXISTS contacts, audit_log, outbox;
			DROP ROLE IF EXISTS henko_test_app;
			CREATE ROLE henko_test_app;
			CREATE TABLE contacts (id text PRIMARY KEY, name text NOT NULL);
		`)
		await pool.query(outboxMigration())
		await pool.query(auditLogMigration())
		// El rol del servicio recibe CRUD; la migración con el rol le saca
		// UPDATE y DELETE sobre la auditoría.
		await pool.query(
			'GRANT SELECT, INSERT, UPDATE, DELETE ON contacts, outbox, audit_log TO henko_test_app'
		)
		await pool.query(auditLogMigration('henko_test_app'))
		tx = new PgTransactions(pool)
		audit = new PgAuditTrail({
			executor: () => tx.executor(),
			source: 'contacts'
		})
		outbox = new PgOutboxPublisher(tx)
	})

	beforeEach(async () => {
		await pool.query('TRUNCATE contacts, audit_log, outbox')
	})

	afterAll(async () => {
		await pool.query(
			'DROP TABLE IF EXISTS contacts, audit_log, outbox; DROP ROLE IF EXISTS henko_test_app'
		)
		await pool.end()
	})

	it('el cambio, la auditoría y el evento se confirman juntos', async () => {
		await createContact('Ana')
		expect(await count('contacts')).toBe(1)
		expect(await count('outbox')).toBe(1)
		const { rows } = await pool.query('SELECT * FROM audit_log')
		expect(rows[0]).toMatchObject({
			action: 'contacts.contact.created',
			entity_id: 'c-Ana',
			actor_origin: 'person',
			actor_id: 'user-1',
			actor_role: 'admin',
			local_id: 'local-1',
			correlation_id: 'corr-1',
			before: null,
			after: { name: 'Ana' }
		})
	})

	it('si la operación falla, no queda nada', async () => {
		await expect(createContact('Beto', true)).rejects.toThrow('falla')
		expect(await count('contacts')).toBe(0)
		expect(await count('audit_log')).toBe(0)
		expect(await count('outbox')).toBe(0)
	})

	it('publicar fuera de una transacción es un error', async () => {
		await expect(
			outbox.publish({
				type: 'x.y.z.v1',
				aggregateType: 'x',
				aggregateId: '1',
				payload: {}
			})
		).rejects.toThrow(/fuera de una transacción/)
	})

	it('el relay manda al bus, y si el bus falla reintenta', async () => {
		await createContact('Caro')
		const bus = new InMemoryMessageBus()
		bus.failNext = 1
		const relay = new OutboxRelay({ transactions: tx, bus })

		expect(await relay.runOnce()).toBe(0)
		const failed = await pool.query(
			'SELECT attempts, last_error, published_at FROM outbox'
		)
		expect(failed.rows[0]).toMatchObject({
			attempts: 1,
			last_error: 'bus caído (simulado)',
			published_at: null
		})

		expect(await relay.runOnce()).toBe(1)
		expect(bus.messages[0]).toMatchObject({
			subject: 'contacts.contact.created.v1',
			data: JSON.stringify({ id: 'c-Caro', name: 'Caro' }),
			headers: {
				'henko-correlation-id': 'corr-1',
				'henko-local-id': 'local-1'
			}
		})
		expect(await relay.runOnce()).toBe(0)
	})

	it('la auditoría es append-only para el rol del servicio', async () => {
		await createContact('Dani')
		const client = await pool.connect()
		try {
			await client.query('SET ROLE henko_test_app')
			await expect(
				client.query("UPDATE audit_log SET action = 'otra'")
			).rejects.toThrow(/permission denied/)
			await expect(client.query('DELETE FROM audit_log')).rejects.toThrow(
				/permission denied/
			)
			await client.query('RESET ROLE')
		} finally {
			client.release()
		}
	})
})
