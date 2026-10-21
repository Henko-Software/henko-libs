import { describe, expect, it } from 'vitest'

import {
	addMoney,
	automatic,
	getContext,
	money,
	multiplyMoney,
	requireContext,
	runWithContext,
	uuidv7
} from './index.js'

describe('contexto', () => {
	it('viaja por los await sin pasarlo por parámetro', async () => {
		const seen = await runWithContext(
			{ actor: { origin: 'person', id: 'u1', role: 'cajero' }, localId: 'l1' },
			async () => {
				await new Promise(resolve => setTimeout(resolve, 5))
				return getContext()
			}
		)
		expect(seen?.localId).toBe('l1')
		expect(seen?.actor).toMatchObject({ id: 'u1', role: 'cajero' })
	})

	it('falla fuerte si falta el contexto', () => {
		expect(() => requireContext()).toThrow(/runWithContext/)
	})

	it('arma actores automáticos', () => {
		expect(automatic('outbox-relay')).toEqual({
			origin: 'automatic',
			label: 'outbox-relay'
		})
	})
})

describe('uuidv7', () => {
	it('tiene formato de UUID versión 7', () => {
		expect(uuidv7()).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		)
	})

	it('ordena por tiempo', () => {
		const first = uuidv7(1_000)
		const second = uuidv7(2_000)
		expect(first < second).toBe(true)
	})
})

describe('plata', () => {
	it('suma en centavos y no mezcla monedas', () => {
		expect(addMoney(money(150), money(250))).toEqual(money(400))
		expect(() => addMoney(money(1), money(1, 'USD'))).toThrow(/convertir/)
	})

	it('rechaza decimales', () => {
		expect(() => money(10.5)).toThrow(/centavos/)
	})

	it('multiplica por cantidad y redondea al centavo', () => {
		expect(multiplyMoney(money(1999), 1.5)).toEqual(money(2999))
	})
})
