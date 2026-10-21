import { connect, type NatsConnection, RetentionPolicy } from 'nats'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { NatsMessageBus } from './index.js'

/**
 * Integración contra un NATS con JetStream. Corre si existe
 * HENKO_TEST_NATS_URL (en local, el de henko-infra); si no, se saltea.
 */
const url = process.env.HENKO_TEST_NATS_URL
const STREAM = 'HENKO_TEST'

describe.skipIf(!url)('bus NATS JetStream', () => {
	let nc: NatsConnection

	beforeAll(async () => {
		nc = await connect({ servers: url })
		const jsm = await nc.jetstreamManager()
		await jsm.streams.delete(STREAM).catch(() => undefined)
		await jsm.streams.add({
			name: STREAM,
			subjects: ['test.>'],
			retention: RetentionPolicy.Limits
		})
	})

	afterAll(async () => {
		const jsm = await nc.jetstreamManager()
		await jsm.streams.delete(STREAM).catch(() => undefined)
		await nc.drain()
	})

	it('publica con cabeceras y descarta el mismo id dos veces', async () => {
		const bus = new NatsMessageBus(nc.jetstream())
		const message = {
			id: '0192b0a1-7c00-7000-8000-000000000001',
			subject: 'test.contact.created.v1',
			data: JSON.stringify({ id: 'c-1' }),
			headers: {
				traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
			}
		}
		await bus.publish(message)
		await bus.publish(message)

		const jsm = await nc.jetstreamManager()
		const info = await jsm.streams.info(STREAM)
		expect(info.state.messages).toBe(1)
		const stored = await jsm.streams.getMessage(STREAM, { seq: 1 })
		expect(stored.subject).toBe('test.contact.created.v1')
		expect(stored.header.get('traceparent')).toContain('4bf92f')
		expect(stored.json()).toEqual({ id: 'c-1' })
	})
})
