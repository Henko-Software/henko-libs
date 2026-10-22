import { type RequestContext, runWithContext } from '@henko-software/core'
import { AppError, commonErrors, toErrorResponse } from '@henko-software/errors'
import { currentTraceId } from '@henko-software/tracing'

/** Lo mínimo de un request y una respuesta de Express que usa el middleware. */
export type HttpRequest = {
	headers: Record<string, string | string[] | undefined>
	path?: string
	url?: string
}

export type HttpResponse = {
	status(code: number): HttpResponse
	json(body: unknown): unknown
}

export type ContextResolver = (
	request: HttpRequest
) => Promise<RequestContext | null>

export type ContextMiddlewareOptions = {
	/**
	 * De dónde sale el contexto: el token interno en un módulo
	 * (`internalTokenResolver`), la sesión en el BFF.
	 */
	resolve: ContextResolver
	/** Rutas sin contexto (salud, login). Todo lo demás nace cerrado. */
	publicPaths?: string[]
}

/**
 * Middleware de Express (Nest lo usa con `app.use`). Cada request corre
 * adentro de su contexto, así el actor y el local llegan solos a casos de
 * uso, auditoría, eventos y logs. Sin contexto válido: 401. Default-deny.
 *
 * Si el resolver devuelve `null` o falla con un error cualquiera (token mal
 * firmado, vencido), es 401. Si falla con un `AppError` (identity no
 * responde, respuesta fuera de contrato), sale ese error: una sesión válida
 * no tiene que ver «iniciá sesión» porque se cayó otro servicio.
 */
const createContextMiddleware = ({
	resolve,
	publicPaths = []
}: ContextMiddlewareOptions) => {
	const isPublic = (path: string) =>
		publicPaths.some(p => path === p || path.startsWith(`${p}/`))

	return (request: HttpRequest, response: HttpResponse, next: () => void) => {
		const path = (request.path ?? request.url ?? '').split('?')[0] ?? ''
		if (isPublic(path)) {
			next()
			return
		}
		resolve(request)
			.then(context => {
				if (!context) {
					const { status, body } = toErrorResponse(
						commonErrors.create('common.unauthenticated'),
						currentTraceId()
					)
					response.status(status).json(body)
					return
				}
				runWithContext(context, next)
			})
			.catch((error: unknown) => {
				const { status, body } = toErrorResponse(
					error instanceof AppError
						? error
						: commonErrors.create('common.unauthenticated'),
					currentTraceId()
				)
				response.status(status).json(body)
			})
	}
}

/** El token interno viene como `Authorization: Bearer <token>`. */
const bearerToken = (request: HttpRequest): string | undefined => {
	const header = request.headers.authorization
	const value = Array.isArray(header) ? header[0] : header
	return value?.startsWith('Bearer ') ? value.slice(7) : undefined
}

/** Resolver para módulos: verifica el token interno del que llama. */
const internalTokenResolver =
	(verifier: {
		verify: (token: string) => Promise<RequestContext>
	}): ContextResolver =>
	async request => {
		const token = bearerToken(request)
		return token ? verifier.verify(token) : null
	}

export { bearerToken, createContextMiddleware, internalTokenResolver }
