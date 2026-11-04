import {
	getContext,
	isEffectiveSuperadmin,
	type RequestContext
} from '@henko-software/core'
import { commonErrors } from '@henko-software/errors'

/**
 * Feature flags en árbol, por instancia. Las claves copian la nav
 * (`orders` → `orders.returns`); el catálogo vive en
 * `@henko-software/contracts-flags`.
 *
 * - Valor propio de cada nodo: `default (código) < env < base`. Una raíz sin
 *   valor está apagada.
 * - Un hijo sin valor propio hereda el del padre; un padre apagado apaga a
 *   sus hijos aunque digan `true`.
 * - Para el superadmin (real y sin «ver como») todo da `true`. Se resuelve
 *   una sola vez por request, en el BFF, y viaja en el token interno: los
 *   módulos sólo leen `context.flags` (`isFlagOn`, `requireFlag`).
 * - Un proceso sin persona no tiene bypass.
 */

export type FlagCatalog<K extends string = string> = Record<
	K,
	{ parent: K | null }
>

/** Valores propios de una capa; la clave que falta no dice nada. */
export type FlagValues<K extends string = string> = Partial<Record<K, boolean>>

export type FlagLayers<K extends string = string> = {
	/** Del código (el catálogo). */
	defaults?: FlagValues<K>
	/** De la variable de entorno de la instancia. */
	env?: FlagValues<K>
	/** De la base (lo que prende o apaga el superadmin desde el panel). */
	base?: FlagValues<K>
}

export type FlagSource = 'base' | 'env' | 'default' | 'inherited'

export type ResolvedFlag<K extends string = string> = {
	key: K
	parent: K | null
	/** Valor propio ganador entre las capas, o `null` si hereda. */
	value: boolean | null
	source: FlagSource
	/** Lo que ven los usuarios (sin bypass). */
	enabled: boolean
}

/**
 * Resuelve el árbol entero con el detalle de cada nodo (para el panel: si
 * el valor es propio o heredado y de qué capa sale).
 */
const resolveFlagTree = <K extends string>(
	catalog: FlagCatalog<K>,
	layers: FlagLayers<K>
): Record<K, ResolvedFlag<K>> => {
	const keys = Object.keys(catalog) as K[]
	const resolved = {} as Record<K, ResolvedFlag<K>>
	const visiting = new Set<K>()

	const own = (key: K): { value: boolean | null; source: FlagSource } => {
		const base = layers.base?.[key]
		if (base !== undefined) return { value: base, source: 'base' }
		const env = layers.env?.[key]
		if (env !== undefined) return { value: env, source: 'env' }
		const fallback = layers.defaults?.[key]
		if (fallback !== undefined) return { value: fallback, source: 'default' }
		return { value: null, source: 'inherited' }
	}

	const visit = (key: K): ResolvedFlag<K> => {
		const done = resolved[key]
		if (done) return done
		if (visiting.has(key)) throw new Error(`Flags con ciclo en ${key}`)
		visiting.add(key)
		const { parent } = catalog[key]
		const parentEnabled =
			parent === null ? true : catalog[parent] ? visit(parent).enabled : false
		const { value, source } = own(key)
		// Raíz sin valor: apagada. Hijo sin valor: lo del padre.
		const ownEnabled = value ?? (parent === null ? false : parentEnabled)
		const node: ResolvedFlag<K> = {
			key,
			parent,
			value,
			source,
			enabled: parentEnabled && ownEnabled
		}
		resolved[key] = node
		visiting.delete(key)
		return node
	}

	for (const key of keys) visit(key)
	return resolved
}

/**
 * Los flags efectivos de quien hace el pedido. Para un superadmin real sin
 * «ver como», todo `true`; viendo como otro rol, resuelve como ese rol; un
 * proceso sin persona, como cualquier usuario. Se llama en UN lugar: el BFF.
 */
const resolveFlags = <K extends string>(
	catalog: FlagCatalog<K>,
	layers: FlagLayers<K>,
	context: RequestContext
): Record<K, boolean> => {
	const bypass = isEffectiveSuperadmin(context)
	const tree = resolveFlagTree(catalog, layers)
	const flags = {} as Record<K, boolean>
	for (const key of Object.keys(catalog) as K[]) {
		flags[key] = bypass || tree[key].enabled
	}
	return flags
}

/**
 * Capa `env`: `orders=true,orders.returns=false`. Una clave fuera del
 * catálogo o un valor que no es `true`/`false` frena el arranque.
 */
const parseFlagList = <K extends string>(
	catalog: FlagCatalog<K>,
	raw: string | undefined
): FlagValues<K> => {
	const values: FlagValues<K> = {}
	for (const part of (raw ?? '').split(',')) {
		const entry = part.trim()
		if (!entry) continue
		const [key = '', value = ''] = entry.split('=').map(s => s.trim())
		if (!Object.hasOwn(catalog, key)) {
			throw new Error(`Flag desconocido: ${key}`)
		}
		if (value !== 'true' && value !== 'false') {
			throw new Error(`Flag ${key}: el valor tiene que ser true o false`)
		}
		values[key as K] = value === 'true'
	}
	return values
}

/**
 * ¿Está prendido para quien hace el pedido? Lee los flags que resolvió el
 * BFF (en el token interno). Sin flags en el contexto, apagado.
 */
const isFlagOn = (
	key: string,
	context: RequestContext | undefined = getContext()
): boolean => context?.flags?.[key] === true

/**
 * Corta si el flag está apagado: 404, como si la sección no existiera. Va
 * al principio del handler del BFF y del caso de uso del módulo.
 */
const requireFlag = (
	key: string,
	context: RequestContext | undefined = getContext()
): void => {
	if (!isFlagOn(key, context)) throw commonErrors.create('common.not_found')
}

export { isFlagOn, parseFlagList, requireFlag, resolveFlags, resolveFlagTree }
