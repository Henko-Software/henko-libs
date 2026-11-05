import { z } from 'zod'

import { type RequestContext, requireContext } from '@henko-software/core'
import { AppError, commonErrors } from '@henko-software/errors'
import { injectTraceHeaders } from '@henko-software/tracing'

/** La forma de error de todo servicio de Henko (`toErrorResponse`). */
const errorBodySchema = z.object({
	error: z.object({
		code: z.string().min(1),
		message: z.string(),
		ref: z.string().optional(),
		details: z.record(z.string(), z.unknown()).optional()
	})
})

export type ServiceSigner = {
	sign: (audience: string, context: RequestContext) => Promise<string>
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type ServiceClientOptions = {
	/** Nombre del servicio destino: es la audiencia del token (`contacts`). */
	service: string
	/** Base de su API interna: `http://contacts:3401`. */
	baseUrl: string
	/** Firma el token interno (`@henko-software/service-auth`). */
	signer: ServiceSigner
	/** Por defecto 10 s. */
	timeoutMs?: number
	/**
	 * Inyecta `traceparent` a mano. Con `@henko-software/tracing-node` activo
	 * no hace falta (la autoinstrumentación de `fetch` ya la pone y a mano
	 * se duplica): sirve para procesos sin autoinstrumentación.
	 */
	propagateTrace?: boolean
	fetch?: typeof fetch
}

export type CallOptions = {
	body?: unknown
	/** Cabeceras extra (`Idempotency-Key`). */
	headers?: Record<string, string>
	/** Corta antes que el timeout del cliente. */
	signal?: AbortSignal
}

/**
 * Error que vino del otro servicio: se reconstruye con la misma clave,
 * estado, mensaje y detalles (los campos de un error de validación), así
 * llega al front igual. Sin el formato estándar, es un error interno (o
 * `common.upstream_timeout` si respondió 504).
 */
const remoteError = async (
	service: string,
	response: Response
): Promise<AppError> => {
	const parsed = errorBodySchema.safeParse(
		await response.json().catch(() => null)
	)
	if (!parsed.success) {
		return commonErrors.create(
			response.status === 504 ? 'common.upstream_timeout' : 'common.internal',
			{ cause: new Error(`${service} respondió ${response.status}`) }
		)
	}
	const { code, message, details } = parsed.data.error
	return new AppError(code, { status: response.status, message }, { details })
}

type QueryValue =
	string | number | boolean | readonly (string | number | boolean)[]

/** `{ roles: ['customer'], approved: [true] }` → `?roles=customer&approved=true`. */
const toQuery = (params: Record<string, QueryValue | undefined>): string => {
	const search = new URLSearchParams()
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) continue
		if (Array.isArray(value)) {
			if (value.length > 0) search.set(key, value.map(String).join(','))
		} else search.set(key, String(value as string | number | boolean))
	}
	const text = search.toString()
	return text ? `?${text}` : ''
}

/** Un segmento de ruta escapado: `/contacts/${segment(id)}`. */
const segment = (value: string): string => encodeURIComponent(value)

/**
 * Cliente HTTP de un servicio de Henko a otro. Cada llamada lleva un token
 * interno firmado con el contexto del pedido (quién, rol efectivo de «ver
 * como», local, flags, correlación) y con el servicio destino como
 * audiencia; nunca cabeceras sueltas tipo `x-user-id`. La respuesta se
 * valida con el contrato y los errores del otro lado vuelven con su clave.
 *
 *   const contacts = createServiceClient({ service: 'contacts', baseUrl, signer })
 *   const { contact } = await contacts.json('GET', `/internal/contacts/${segment(id)}`, contactResponseSchema)
 */
const createServiceClient = (options: ServiceClientOptions) => {
	const timeoutMs = options.timeoutMs ?? 10_000

	const send = async (
		method: HttpMethod,
		path: string,
		call: CallOptions = {}
	): Promise<Response> => {
		const token = await options.signer.sign(options.service, requireContext())
		const timeout = AbortSignal.timeout(timeoutMs)
		const signal = call.signal
			? AbortSignal.any([call.signal, timeout])
			: timeout
		let response: Response
		try {
			response = await (options.fetch ?? fetch)(
				new URL(path, options.baseUrl),
				{
					method,
					headers: {
						...(options.propagateTrace ? injectTraceHeaders() : {}),
						...call.headers,
						authorization: `Bearer ${token}`,
						accept: 'application/json',
						...(call.body === undefined
							? {}
							: { 'content-type': 'application/json' })
					},
					body: call.body === undefined ? undefined : JSON.stringify(call.body),
					signal
				}
			)
		} catch (error) {
			throw error instanceof Error &&
				(error.name === 'TimeoutError' || timeout.aborted)
				? commonErrors.create('common.upstream_timeout', { cause: error })
				: commonErrors.create('common.internal', { cause: error })
		}
		if (!response.ok) throw await remoteError(options.service, response)
		return response
	}

	const outOfContract = (path: string, cause: unknown) =>
		commonErrors.create('common.internal', {
			cause: new Error(
				`Respuesta de ${options.service} fuera de contrato en ${path}`,
				{ cause }
			)
		})

	/** Llama y valida la respuesta con el schema del contrato. */
	const json = async <S extends z.ZodType>(
		method: HttpMethod,
		path: string,
		schema: S,
		call?: CallOptions
	): Promise<z.output<S>> => {
		const response = await send(method, path, call)
		const parsed = schema.safeParse(await response.json().catch(() => null))
		if (!parsed.success) throw outOfContract(path, parsed.error)
		return parsed.data
	}

	/** Llama a algo que no devuelve nada que importe (204 o cuerpo ignorado). */
	const empty = async (
		method: HttpMethod,
		path: string,
		call?: CallOptions
	): Promise<void> => {
		const response = await send(method, path, call)
		await response.body?.cancel()
	}

	return { service: options.service, send, json, empty }
}

export type ServiceClient = ReturnType<typeof createServiceClient>

export { createServiceClient, errorBodySchema, remoteError, segment, toQuery }
