import { describe, expect, it } from 'vitest'

import { defineErrors, errorRef, toErrorResponse } from './index.js'

const errors = defineErrors({
	'contacts.not_found': { status: 404, message: 'No encontramos el contacto.' },
	'contacts.invalid': { status: 400, message: 'El contacto no es válido.' }
})

describe('catálogo de errores', () => {
	it('crea errores con estado y mensaje para la persona', () => {
		const error = errors.create('contacts.not_found')
		expect(error.status).toBe(404)
		expect(error.publicMessage).toBe('No encontramos el contacto.')
		expect(errors.is(error, 'contacts.not_found')).toBe(true)
	})
})

describe('respuesta de error', () => {
	const traceId = '4bf92f3577b34da6a3ce929d0e0e4736'

	it('el código sale de la traza', () => {
		expect(errorRef(traceId)).toBe('H-4BF92F')
		expect(errorRef()).toMatch(/^H-[0-9A-F]{6}$/)
	})

	it('devuelve clave, mensaje, código y detalle de un error conocido', () => {
		const response = toErrorResponse(
			errors.create('contacts.invalid', { details: { taxId: 'formato' } }),
			traceId
		)
		expect(response).toEqual({
			status: 400,
			body: {
				error: {
					code: 'contacts.invalid',
					message: 'El contacto no es válido.',
					ref: 'H-4BF92F',
					details: { taxId: 'formato' }
				}
			}
		})
	})

	it('nunca muestra el error interno', () => {
		const response = toErrorResponse(
			new Error('connection refused 10.0.0.3:5432'),
			traceId
		)
		expect(response.status).toBe(500)
		expect(response.body.error.code).toBe('common.internal')
		expect(JSON.stringify(response)).not.toContain('10.0.0.3')
	})
})
