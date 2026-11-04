import { describe, expect, it } from 'vitest'

import {
	canSeeTrailOf,
	effectiveRole,
	isEffectiveSuperadmin,
	type RequestContext,
	runWithContext,
	visibleAuthor,
	visibleTrail
} from './index.js'

const superadmin: RequestContext = {
	actor: { origin: 'person', id: 's1', role: 'superadmin' }
}
const viewingAsCashier: RequestContext = {
	...superadmin,
	effective: { userId: 's1', role: 'cashier', localIds: ['l1'] },
	viewAs: { role: 'cashier', localId: 'l1' }
}
const admin: RequestContext = {
	actor: { origin: 'person', id: 'a1', role: 'admin' }
}
const cron: RequestContext = { actor: { origin: 'automatic', label: 'cron' } }

const rows = [
	{ id: 1, actorRole: 'superadmin' },
	{ id: 2, actorRole: 'admin' },
	{ id: 3, actorRole: null }
]

describe('rol efectivo', () => {
	it('es el de «ver como» si hay, el del actor si no, y nada para un proceso', () => {
		expect(effectiveRole(superadmin)).toBe('superadmin')
		expect(effectiveRole(viewingAsCashier)).toBe('cashier')
		expect(effectiveRole(cron)).toBeUndefined()
		expect(isEffectiveSuperadmin(superadmin)).toBe(true)
		expect(isEffectiveSuperadmin(viewingAsCashier)).toBe(false)
	})

	it('un efectivo de superadmin no sirve si el actor real no lo es', () => {
		expect(
			isEffectiveSuperadmin({
				...admin,
				effective: { userId: 'a1', role: 'superadmin', localIds: [] }
			})
		).toBe(false)
	})
})

describe('rastro del superadmin', () => {
	it('sólo lo ve un superadmin real sin «ver como»', () => {
		expect(visibleTrail(rows, r => r.actorRole, superadmin)).toHaveLength(3)
		expect(visibleTrail(rows, r => r.actorRole, admin).map(r => r.id)).toEqual([
			2, 3
		])
		expect(
			visibleTrail(rows, r => r.actorRole, viewingAsCashier).map(r => r.id)
		).toEqual([2, 3])
		expect(canSeeTrailOf('superadmin', cron)).toBe(false)
	})

	it('toma el contexto del request si no se lo pasan', () => {
		expect(runWithContext(admin, () => canSeeTrailOf('superadmin'))).toBe(false)
		expect(runWithContext(superadmin, () => canSeeTrailOf('superadmin'))).toBe(
			true
		)
	})

	it('el dato queda, el autor se calla', () => {
		const author = { id: 's1', name: 'Equipo Henko' }
		expect(visibleAuthor(author, 'superadmin', admin)).toBeNull()
		expect(visibleAuthor(author, 'superadmin', superadmin)).toEqual(author)
		expect(visibleAuthor(author, 'admin', admin)).toEqual(author)
	})
})
