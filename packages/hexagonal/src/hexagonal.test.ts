import { describe, expect, it } from 'vitest'

import {
	defineAuditActions,
	diffFields,
	type TransactionRunner,
	UseCase
} from './index.js'

class Greet extends UseCase<string, string> {
	readonly name = 'demo.greet'
	protected async handle(input: string) {
		return `hola ${input}`
	}
}

describe('caso de uso', () => {
	it('corre adentro de la transacción', async () => {
		const calls: string[] = []
		const tx: TransactionRunner = {
			run: async work => {
				calls.push('begin')
				const result = await work()
				calls.push('commit')
				return result
			}
		}
		expect(await new Greet(tx).execute('Ana')).toBe('hola Ana')
		expect(calls).toEqual(['begin', 'commit'])
	})
})

describe('auditoría', () => {
	it('cada acción tiene nombre legible', () => {
		const actions = defineAuditActions({
			'contacts.contact.created': 'Alta de contacto'
		})
		expect(actions.label('contacts.contact.created')).toBe('Alta de contacto')
	})

	it('guarda sólo lo que cambió', () => {
		expect(
			diffFields(
				{ name: 'A', roles: ['customer'], phone: '1' },
				{ name: 'A', roles: ['customer', 'supplier'], phone: '1' }
			)
		).toEqual({
			before: { roles: ['customer'] },
			after: { roles: ['customer', 'supplier'] }
		})
		expect(diffFields(null, { name: 'A' })).toEqual({
			before: null,
			after: { name: 'A' }
		})
	})
})
