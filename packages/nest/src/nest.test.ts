import { Writable } from 'node:stream'
import { NotFoundException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { getContext } from '@henko-software/core'
import { defineErrors } from '@henko-software/errors'
import { createLogger } from '@henko-software/logger'

import {
	createContextMiddleware,
	HenkoErrorFilter,
	type HttpResponse,
	parseInput
} from './index.js'

import 'reflect-metadata'

const fakeResponse = () => {
	const sent: { status?: number; body?: unknown } = {}
	const response: HttpResponse = {
		status(code) {
			sent.status = code
			return response
		},
		json(body) {
			sent.body = body
			return body
		}
	}
	return { response, sent }
}

const silentLogger = createLogger({
	service: 'test',
	version: '0',
	instance: 'test',
	destination: new Writable({ write: (_c, _e, cb) => cb() })
})

const host = (response: HttpResponse) =>
	({
		switchToHttp: () => ({ getResponse: () => response })
	}) as never

describe('middleware de contexto', () => {
	const middleware = createContextMiddleware({
		publicPaths: ['/health'],
		resolve: async request =>
			request.headers.authorization === 'Bearer ok'
				? { actor: { origin: 'person', id: 'u1', role: 'admin' } }
				: null
	})

	it('corre el request adentro del contexto', async () => {
		const { response } = fakeResponse()
		const actor = await new Promise(resolve =>
			middleware(
				{ headers: { authorization: 'Bearer ok' }, path: '/users' },
				response,
				() => resolve(getContext()?.actor)
			)
		)
		expect(actor).toMatchObject({ id: 'u1' })
	})

	it('sin contexto válido responde 401, salvo las rutas públicas', async () => {
		const { response, sent } = fakeResponse()
		middleware({ headers: {}, path: '/users' }, response, () => {
			throw new Error('no debería pasar')
		})
		await new Promise(resolve => setTimeout(resolve, 0))
		expect(sent.status).toBe(401)
		expect(sent.body).toMatchObject({
			error: { code: 'common.unauthenticated' }
		})

		let passed = false
		middleware(
			{ headers: {}, path: '/health' },
			fakeResponse().response,
			() => {
				passed = true
			}
		)
		expect(passed).toBe(true)
	})
})

describe('filtro de errores', () => {
	const filter = new HenkoErrorFilter(silentLogger)
	const errors = defineErrors({
		'users.email_taken': { status: 409, message: 'Ese mail ya está en uso.' }
	})

	it('un error del catálogo sale con su mensaje', () => {
		const { response, sent } = fakeResponse()
		filter.catch(errors.create('users.email_taken'), host(response))
		expect(sent.status).toBe(409)
		expect(sent.body).toMatchObject({
			error: { code: 'users.email_taken', message: 'Ese mail ya está en uso.' }
		})
	})

	it('los errores de Nest y los desconocidos no filtran detalles', () => {
		const notFound = fakeResponse()
		filter.catch(new NotFoundException(), host(notFound.response))
		expect(notFound.sent.status).toBe(404)

		const unknown = fakeResponse()
		filter.catch(new Error('ECONNREFUSED 10.0.0.3'), host(unknown.response))
		expect(unknown.sent.status).toBe(500)
		expect(JSON.stringify(unknown.sent.body)).not.toContain('10.0.0.3')
	})
})

describe('parseInput', () => {
	const schema = z.object({ email: z.email(), name: z.string().min(1) })

	it('devuelve el dato tipado o un error por campo', () => {
		expect(parseInput(schema, { email: 'a@b.com', name: 'A' })).toEqual({
			email: 'a@b.com',
			name: 'A'
		})
		try {
			parseInput(schema, { email: 'no', name: '' })
			expect.unreachable()
		} catch (error) {
			expect(error).toMatchObject({
				key: 'common.validation',
				details: {
					fields: { email: expect.any(String), name: expect.any(String) }
				}
			})
		}
	})
})
