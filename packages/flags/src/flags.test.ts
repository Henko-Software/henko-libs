import { describe, expect, it } from 'vitest'

import { type RequestContext, runWithContext } from '@henko-software/core'

import {
	type FlagCatalog,
	isFlagOn,
	parseFlagList,
	requireFlag,
	resolveFlags,
	resolveFlagTree
} from './index.js'

type Key = 'orders' | 'orders.returns' | 'orders.returns.export' | 'reports'

const catalog: FlagCatalog<Key> = {
	orders: { parent: null },
	'orders.returns': { parent: 'orders' },
	'orders.returns.export': { parent: 'orders.returns' },
	reports: { parent: null }
}

const cashier: RequestContext = {
	actor: { origin: 'person', id: 'c1', role: 'cashier' }
}
const superadmin: RequestContext = {
	actor: { origin: 'person', id: 's1', role: 'superadmin' }
}
const viewingAsCashier: RequestContext = {
	...superadmin,
	effective: { userId: 's1', role: 'cashier', localIds: [] },
	viewAs: { role: 'cashier' }
}
const cron: RequestContext = { actor: { origin: 'automatic', label: 'cron' } }

describe('flags en árbol', () => {
	it('raíces apagadas por defecto; un hijo sin valor hereda del padre', () => {
		expect(resolveFlags(catalog, {}, cashier)).toEqual({
			orders: false,
			'orders.returns': false,
			'orders.returns.export': false,
			reports: false
		})
		const flags = resolveFlags(catalog, { base: { orders: true } }, cashier)
		expect(flags['orders.returns']).toBe(true)
		expect(flags['orders.returns.export']).toBe(true)
		expect(flags.reports).toBe(false)
	})

	it('padre apagado gana aunque el hijo diga true', () => {
		const flags = resolveFlags(
			catalog,
			{ base: { orders: false, 'orders.returns': true } },
			cashier
		)
		expect(flags['orders.returns']).toBe(false)
		expect(flags['orders.returns.export']).toBe(false)
	})

	it('un hijo apagado no apaga al padre y apaga a sus hijos', () => {
		const flags = resolveFlags(
			catalog,
			{ base: { orders: true, 'orders.returns': false } },
			cashier
		)
		expect(flags).toMatchObject({
			orders: true,
			'orders.returns': false,
			'orders.returns.export': false
		})
	})

	it('precedencia por nodo: código < env < base', () => {
		const tree = resolveFlagTree(catalog, {
			defaults: { orders: true, reports: true },
			env: { orders: false, reports: false },
			base: { orders: true }
		})
		expect(tree.orders).toMatchObject({ value: true, source: 'base' })
		expect(tree.reports).toMatchObject({
			value: false,
			source: 'env',
			enabled: false
		})
		expect(tree['orders.returns']).toMatchObject({
			value: null,
			source: 'inherited',
			enabled: true
		})
	})

	it('superadmin: todo true; viendo como otro rol, como ese rol; un proceso, sin bypass', () => {
		const layers = { base: { orders: false } }
		expect(Object.values(resolveFlags(catalog, layers, superadmin))).toEqual([
			true,
			true,
			true,
			true
		])
		expect(resolveFlags(catalog, layers, viewingAsCashier).orders).toBe(false)
		expect(resolveFlags(catalog, layers, cron).orders).toBe(false)
	})

	it('la capa env sale de una lista y frena con claves desconocidas', () => {
		expect(parseFlagList(catalog, 'orders=true, orders.returns=false')).toEqual(
			{ orders: true, 'orders.returns': false }
		)
		expect(parseFlagList(catalog, '')).toEqual({})
		expect(() => parseFlagList(catalog, 'ventas=true')).toThrow(/ventas/)
		expect(() => parseFlagList(catalog, 'orders=si')).toThrow(/true o false/)
	})
})

describe('en los módulos', () => {
	it('leen los flags del contexto y cortan con 404', () => {
		const context: RequestContext = {
			...cashier,
			flags: { orders: true, reports: false }
		}
		runWithContext(context, () => {
			expect(isFlagOn('orders')).toBe(true)
			expect(isFlagOn('reports')).toBe(false)
			expect(isFlagOn('nada')).toBe(false)
			expect(() => requireFlag('orders')).not.toThrow()
			expect(() => requireFlag('reports')).toThrow(
				expect.objectContaining({ key: 'common.not_found', status: 404 })
			)
		})
	})

	it('con el token de un superadmin, una sección apagada anda', () => {
		const flags = resolveFlags(catalog, { base: { orders: false } }, superadmin)
		runWithContext({ ...superadmin, flags }, () => {
			expect(() => requireFlag('orders.returns')).not.toThrow()
		})
		const asCashier = resolveFlags(
			catalog,
			{ base: { orders: false } },
			viewingAsCashier
		)
		runWithContext({ ...viewingAsCashier, flags: asCashier }, () => {
			expect(() => requireFlag('orders.returns')).toThrow()
		})
	})
})
