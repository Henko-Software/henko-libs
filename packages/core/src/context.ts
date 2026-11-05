import { AsyncLocalStorage } from 'node:async_hooks'

/** Una persona que hizo algo. El rol se guarda como estaba en ese momento. */
export type PersonActor = {
	origin: 'person'
	id: string
	name?: string
	role: string
}

/**
 * Un proceso automático (sync nocturno, relay del outbox, cierre de caja
 * programado). «No hay usuario» no es «automático»: lo decide quien escribe.
 */
export type AutomaticActor = {
	origin: 'automatic'
	label: string
}

export type Actor = PersonActor | AutomaticActor

/**
 * Con qué rol, persona y locales se trata al actor. Es distinto del actor
 * sólo cuando un superadmin está «viendo como» otro rol: permisos, scope y
 * flags usan esto; auditoría, trazas y sesión usan `actor` (el real).
 */
export type EffectiveAccess = {
	/** La persona como la que se ve (el actor, o la elegida en «ver como»). */
	userId: string
	role: string
	/**
	 * Locales que puede ver. Para los roles de casa central (que ven todos)
	 * no se mira; para los demás, vacío = ninguno (`localsInScope`).
	 */
	localIds: string[]
}

/** El «ver como» en curso de un superadmin. */
export type ViewAs = {
	role: string
	/** Una persona concreta: sólo lectura. */
	userId?: string
	localId?: string
}

/**
 * Lo que acompaña a cada request, job o mensaje. El actor sale de acá, no se
 * pasa por parámetro a cada función. La traza no está acá: la lleva
 * OpenTelemetry.
 */
export type RequestContext = {
	actor: Actor
	/** Local o franquicia sobre la que se opera (alcance), si aplica. */
	localId?: string
	/** El flujo de negocio entero (por ejemplo, una venta y todo lo que dispara). */
	correlationId?: string
	/** El evento o request que causó este trabajo. */
	causationId?: string
	/**
	 * Rol, persona y locales efectivos. Si no viene, son los del actor. Lo
	 * pone el BFF (y viaja en el token interno).
	 */
	effective?: EffectiveAccess
	/** Si un superadmin está viendo como otro rol. Va a la auditoría. */
	viewAs?: ViewAs
	/**
	 * Flags efectivos de la persona, resueltos una sola vez en el BFF
	 * (`@henko-software/flags`). Los módulos los leen de acá, nunca de una
	 * tabla.
	 */
	flags?: Record<string, boolean>
}

const storage = new AsyncLocalStorage<RequestContext>()

/** Corre `work` con este contexto; todo lo que llame adentro lo ve. */
const runWithContext = <T>(context: RequestContext, work: () => T): T =>
	storage.run(context, work)

/** El contexto actual, si hay. */
const getContext = (): RequestContext | undefined => storage.getStore()

/** El contexto actual; si no hay, es un error de cableado y falla fuerte. */
const requireContext = (): RequestContext => {
	const context = storage.getStore()
	if (!context) {
		throw new Error(
			'No hay contexto de request. Envolvé el trabajo con runWithContext (el BFF, el consumidor de eventos o el job lo hacen).'
		)
	}
	return context
}

/** Actor para procesos automáticos: `automatic('outbox-relay')`. */
const automatic = (label: string): AutomaticActor => ({
	origin: 'automatic',
	label
})

/** El rol de Henko que ve todo. */
const SUPERADMIN_ROLE = 'superadmin'

/**
 * El rol con el que se trata a quien hace el pedido: el efectivo si hay «ver
 * como», el del actor si no. Un proceso automático no tiene rol.
 */
const effectiveRole = (
	context: RequestContext | undefined = getContext()
): string | undefined => {
	if (!context) return undefined
	if (context.effective) return context.effective.role
	return context.actor.origin === 'person' ? context.actor.role : undefined
}

/**
 * ¿Es un superadmin real que no está viendo como otro rol? Sólo así no tiene
 * flags y ve el rastro de otros superadmins.
 */
const isEffectiveSuperadmin = (
	context: RequestContext | undefined = getContext()
): boolean =>
	context?.actor.origin === 'person' &&
	context.actor.role === SUPERADMIN_ROLE &&
	effectiveRole(context) === SUPERADMIN_ROLE

/**
 * Decisión asumida 17 (ronda 2026-11-05): un rol atado a locales sin locales
 * asignados **no ve nada**. Los locales al alcance son los efectivos del
 * token o, si no trae, el local en curso; si no hay ninguno, `[]` (nada,
 * nunca «todos»). Los roles que ven todos los locales (casa central) los
 * decide cada módulo y no pasan por acá.
 */
const localsInScope = (
	context: RequestContext | undefined = getContext()
): string[] => {
	if (!context) return []
	const effective = context.effective?.localIds ?? []
	if (effective.length > 0) return [...effective]
	return context.localId ? [context.localId] : []
}

export {
	automatic,
	effectiveRole,
	getContext,
	isEffectiveSuperadmin,
	localsInScope,
	requireContext,
	runWithContext,
	SUPERADMIN_ROLE
}
