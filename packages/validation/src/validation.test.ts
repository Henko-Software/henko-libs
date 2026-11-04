import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { validate } from './index.js'

const user = z.object({
	email: z.email(),
	name: z.string().trim().min(1).max(5),
	role: z.enum(['admin', 'cashier']),
	password: z.string().min(10),
	localIds: z.array(z.string()).min(1),
	age: z.number().int().min(18),
	web: z.url().optional(),
	code: z.string().startsWith('H-').optional()
})

const fieldsOf = (value: unknown, schema: z.ZodType = user) => {
	const result = validate(schema, value)
	if (result.success) throw new Error('debería fallar')
	return result.fields
}

describe('mensajes de validación en castellano', () => {
	it('dice qué hacer con cada campo, en castellano', () => {
		expect(
			fieldsOf({
				email: 'ana',
				name: 'Anastasia',
				role: 'jefe',
				password: 'corta',
				localIds: [],
				age: 15,
				web: 'no',
				code: 'X'
			})
		).toEqual({
			email: 'Escribí un mail válido (por ejemplo, nombre@empresa.com).',
			name: 'Puede tener hasta 5 caracteres.',
			role: 'Elegí una de las opciones.',
			password: 'Tiene que tener al menos 10 caracteres.',
			localIds: 'Elegí al menos uno.',
			age: 'Tiene que ser 18 o más.',
			web: 'Escribí una dirección web válida.',
			code: 'Tiene que empezar con «H-».'
		})
	})

	it('lo que falta o viene vacío pide completarlo', () => {
		expect(fieldsOf({ name: '', age: 'x' })).toMatchObject({
			email: 'Completá este campo.',
			name: 'Completá este campo.',
			role: 'Completá este campo.',
			age: 'Tiene que ser un número.'
		})
		expect(fieldsOf(null)).toEqual({ _: 'Completá este campo.' })
	})

	it('un mensaje propio del schema gana', () => {
		expect(
			fieldsOf({}, z.object({ name: z.string('Poné el nombre.') }))
		).toEqual({ name: 'Poné el nombre.' })
	})

	it('campos de más y rutas anidadas', () => {
		expect(
			fieldsOf(
				{ items: [{ price: -1 }], extra: 1 },
				z.strictObject({
					items: z.array(z.object({ price: z.number().positive() }))
				})
			)
		).toEqual({
			'items.0.price': 'Tiene que ser mayor que 0.',
			_: 'Sobra el campo «extra».'
		})
	})

	it('si pasa, devuelve los datos', () => {
		expect(validate(z.object({ a: z.string() }), { a: 'x' })).toEqual({
			success: true,
			data: { a: 'x' }
		})
	})
})
