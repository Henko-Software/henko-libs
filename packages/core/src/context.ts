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

export { automatic, getContext, requireContext, runWithContext }
