import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { runWithContext } from '@henko-software/core'

import { createLogger } from './index.js'

const capture = () => {
	const lines: Record<string, unknown>[] = []
	const destination = new Writable({
		write(chunk: Buffer, _encoding, callback) {
			lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>)
			callback()
		}
	})
	return { lines, destination }
}

describe('logger', () => {
	it('suma servicio, actor y local sin pasarlos', () => {
		const { lines, destination } = capture()
		const logger = createLogger({
			service: 'identity',
			version: '1.0.0',
			instance: 'dev',
			destination
		})
		runWithContext(
			{
				actor: { origin: 'person', id: 'u1', name: 'Ana', role: 'cajero' },
				localId: 'l1',
				correlationId: 'c1'
			},
			() => logger.info('venta registrada')
		)
		expect(lines[0]).toMatchObject({
			level: 'info',
			msg: 'venta registrada',
			service: 'identity',
			instance: 'dev',
			local_id: 'l1',
			correlation_id: 'c1',
			actor: { id: 'u1', role: 'cajero', origin: 'person' }
		})
		// El nombre de la persona no va a los logs.
		expect(JSON.stringify(lines[0])).not.toContain('Ana')
	})

	it('enmascara datos sensibles', () => {
		const { lines, destination } = capture()
		const logger = createLogger({
			service: 'identity',
			version: '1.0.0',
			instance: 'dev',
			destination
		})
		logger.info(
			{ contact: { cuit: '30-71234567-1', email: 'a@b.com', name: 'X' } },
			'alta'
		)
		expect(lines[0]?.contact).toEqual({
			cuit: '[oculto]',
			email: '[oculto]',
			name: 'X'
		})
	})
})
