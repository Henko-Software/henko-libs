import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { type RequestContext, runWithContext } from '@henko-software/core'
import { AppError } from '@henko-software/errors'

import { createServiceClient, segment, toQuery } from './client.js'

const context: RequestContext = {
	actor: { origin: 'person', id: 'u1', role: 'admin' },
	correlationId: 'c1'
}

type Seen = { url: string; init: RequestInit; audience: string }

const setup = (respond: (seen: Seen) => Response | Promise<Response>) => {
	const seen: Seen[] = []
	let audience = ''
	const client = createServiceClient({
		service: 'contacts',
		baseUrl: 'http://contacts:3401',
		timeoutMs: 50,
		signer: {
			sign: (aud, ctx) => {
				audience = aud
				return Promise.resolve(`token-for-${ctx.correlationId ?? ''}`)
			}
		},
		fetch: (input, init = {}) => {
			const call = { url: String(input), init, audience }
			seen.push(call)
			return Promise.resolve(respond(call))
		}
	})
	return { client, seen }
}

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	})

describe('createServiceClient', () => {
	it('firma con la audiencia del servicio y valida la respuesta', async () => {
		const { client, seen } = setup(() => json(200, { id: 'a', extra: 1 }))
		const result = await runWithContext(context, () =>
			client.json('POST', '/internal/things', z.object({ id: z.string() }), {
				body: { name: 'x' },
				headers: { 'idempotency-key': 'k1' }
			})
		)
		expect(result).toEqual({ id: 'a' })
		const [call] = seen
		expect(call?.url).toBe('http://contacts:3401/internal/things')
		expect(call?.audience).toBe('contacts')
		const headers = call?.init.headers as Record<string, string>
		expect(headers.authorization).toBe('Bearer token-for-c1')
		expect(headers['content-type']).toBe('application/json')
		expect(headers['idempotency-key']).toBe('k1')
		expect(call?.init.body).toBe('{"name":"x"}')
	})

	it('reconstruye el error del otro servicio con la misma clave', async () => {
		const { client } = setup(() =>
			json(422, {
				error: {
					code: 'contacts.duplicated',
					message: 'Ya existe.',
					ref: 'H-1',
					details: { fields: { name: 'Repetido' } }
				}
			})
		)
		const error = await runWithContext(context, () =>
			client.empty('POST', '/x')
		).catch((e: unknown) => e)
		expect(error).toBeInstanceOf(AppError)
		expect(error).toMatchObject({
			key: 'contacts.duplicated',
			status: 422,
			publicMessage: 'Ya existe.',
			details: { fields: { name: 'Repetido' } }
		})
	})

	it('sin formato estándar es interno; 504 es upstream_timeout', async () => {
		const plain = setup(() => new Response('nope', { status: 500 }))
		await expect(
			runWithContext(context, () => plain.client.empty('GET', '/x'))
		).rejects.toMatchObject({ key: 'common.internal' })
		const gateway = setup(() => new Response('', { status: 504 }))
		await expect(
			runWithContext(context, () => gateway.client.empty('GET', '/x'))
		).rejects.toMatchObject({ key: 'common.upstream_timeout' })
	})

	it('respuesta fuera de contrato es un error interno', async () => {
		const { client } = setup(() => json(200, { id: 3 }))
		await expect(
			runWithContext(context, () =>
				client.json('GET', '/x', z.object({ id: z.string() }))
			)
		).rejects.toMatchObject({ key: 'common.internal' })
	})

	it('si no contesta a tiempo, upstream_timeout', async () => {
		const { client } = setup(
			({ init }) =>
				new Promise<Response>((_, reject) => {
					init.signal?.addEventListener('abort', () =>
						reject(init.signal?.reason as Error)
					)
				})
		)
		await expect(
			runWithContext(context, () => client.empty('GET', '/slow'))
		).rejects.toMatchObject({ key: 'common.upstream_timeout' })
	})

	it('sin contexto no llama', async () => {
		const { client, seen } = setup(() => json(200, {}))
		await expect(client.empty('GET', '/x')).rejects.toThrow()
		expect(seen).toHaveLength(0)
	})
})

describe('toQuery y segment', () => {
	it('arma la query con listas separadas por coma', () => {
		expect(
			toQuery({ roles: ['a', 'b'], approved: [true], empty: [], q: undefined })
		).toBe('?roles=a%2Cb&approved=true')
		expect(toQuery({})).toBe('')
		expect(segment('a/b c')).toBe('a%2Fb%20c')
	})
})
