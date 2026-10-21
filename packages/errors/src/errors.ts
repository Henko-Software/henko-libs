/**
 * Errores que ve el usuario. Cada error tiene una clave estable, un estado
 * HTTP y un mensaje para la persona. El catálogo exige el mensaje: un error
 * sin texto legible no compila.
 */
export type ErrorDefinition = {
	status: number
	/** Lo que lee la persona: qué pasó y, si se puede, qué hacer. */
	message: string
}

export type ErrorCatalog = Record<string, ErrorDefinition>

type ErrorOptions = {
	/** Datos para que el front muestre el error por campo. Sólo en errores 4xx. */
	details?: Record<string, unknown>
	cause?: unknown
}

class AppError extends Error {
	readonly key: string
	readonly status: number
	readonly publicMessage: string
	readonly details?: Record<string, unknown>

	constructor(
		key: string,
		definition: ErrorDefinition,
		options: ErrorOptions = {}
	) {
		super(`${key}: ${definition.message}`, { cause: options.cause })
		this.name = 'AppError'
		this.key = key
		this.status = definition.status
		this.publicMessage = definition.message
		this.details = options.details
	}
}

/**
 * Define el catálogo de errores de un módulo:
 *
 *   const errors = defineErrors({
 *     'contacts.not_found': { status: 404, message: 'No encontramos el contacto.' }
 *   })
 *   throw errors.create('contacts.not_found')
 */
const defineErrors = <C extends ErrorCatalog>(catalog: C) => ({
	catalog,
	create: (key: keyof C & string, options?: ErrorOptions) => {
		const definition = catalog[key]
		if (!definition) throw new Error(`Error sin definir: ${key}`)
		return new AppError(key, definition, options)
	},
	is: (error: unknown, key: keyof C & string): error is AppError =>
		error instanceof AppError && error.key === key
})

/** Los que comparten todos los servicios. */
const commonErrors = defineErrors({
	'common.internal': {
		status: 500,
		message:
			'Algo salió mal. Probá de nuevo en un momento; si sigue pasando, mandá un feedback con el código.'
	},
	'common.validation': {
		status: 400,
		message: 'Hay datos que no son válidos. Revisá los campos marcados.'
	},
	'common.unauthenticated': {
		status: 401,
		message: 'Tenés que iniciar sesión.'
	},
	'common.forbidden': {
		status: 403,
		message: 'No tenés permiso para hacer esto.'
	},
	'common.not_found': {
		status: 404,
		message: 'No encontramos lo que buscabas.'
	},
	'common.conflict': {
		status: 409,
		message: 'Alguien cambió esto mientras tanto. Recargá y probá de nuevo.'
	},
	'common.upstream_timeout': {
		status: 504,
		message: 'Un servicio externo no respondió a tiempo. Probá de nuevo.'
	}
})

export { AppError, commonErrors, defineErrors }
