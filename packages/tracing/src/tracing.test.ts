import { NodeSDK } from '@opentelemetry/sdk-node'
import {
	InMemorySpanExporter,
	SimpleSpanProcessor
} from '@opentelemetry/sdk-trace'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
	currentTraceId,
	injectTraceHeaders,
	recordErrorOnSpan,
	withRemoteContext,
	withSpan
} from './index.js'

const exporter = new InMemorySpanExporter()
const processor = new SimpleSpanProcessor({ exporter })
const sdk = new NodeSDK({
	spanProcessors: [processor],
	instrumentations: []
})

beforeAll(() => sdk.start())
afterAll(() => sdk.shutdown())

describe('trazas', () => {
	it('sin traza en curso no inventa ids', () => {
		expect(currentTraceId()).toBeUndefined()
	})

	it('withSpan abre un span y marca el error si falla', async () => {
		await expect(
			withSpan('falla', async () => {
				expect(currentTraceId()).toMatch(/^[0-9a-f]{32}$/)
				throw new Error('boom')
			})
		).rejects.toThrow('boom')
		await processor.forceFlush()
		const span = exporter.getFinishedSpans().find(s => s.name === 'falla')
		expect(span?.status.code).toBe(2)
		expect(span?.events[0]?.name).toBe('exception')
	})

	it('el span guarda el código que vio la persona', async () => {
		await withSpan('con-error', async () => {
			recordErrorOnSpan({
				ref: 'H-ABC123',
				code: 'common.internal',
				status: 500
			})
		})
		await processor.forceFlush()
		const span = exporter.getFinishedSpans().find(s => s.name === 'con-error')
		expect(span?.attributes['henko.error.ref']).toBe('H-ABC123')
		expect(span?.attributes['henko.error.code']).toBe('common.internal')
		expect(span?.status.code).toBe(2)
	})

	it('la traza sigue del otro lado de un mensaje', async () => {
		let headers: Record<string, string> = {}
		let original: string | undefined
		await withSpan('productor', async () => {
			original = currentTraceId()
			headers = injectTraceHeaders()
		})
		expect(headers.traceparent).toContain(original)

		const continued = await withRemoteContext(headers, () =>
			withSpan('consumidor', async () => currentTraceId())
		)
		expect(continued).toBe(original)
	})
})
