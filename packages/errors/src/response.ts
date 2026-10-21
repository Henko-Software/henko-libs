import { randomBytes } from 'node:crypto'

import { AppError, commonErrors } from './errors.js'

/**
 * Código corto que ve el usuario (H-4BF92F). Sale de la traza: pegado en la
 * Console lleva a la traza y a los logs de ese error. Sin traza, uno al azar
 * (igual queda en el log de ese error).
 */
const errorRef = (traceId?: string): string =>
	`H-${(traceId ? traceId.slice(0, 6) : randomBytes(3).toString('hex')).toUpperCase()}`

export type ErrorBody = {
	error: {
		code: string
		message: string
		ref: string
		details?: Record<string, unknown>
	}
}

export type ErrorResponse = {
	status: number
	body: ErrorBody
}

/**
 * Lo que se le devuelve al cliente ante un error. Nunca stack, nunca el
 * mensaje interno: un error que no es del catálogo sale como `common.internal`.
 */
const toErrorResponse = (error: unknown, traceId?: string): ErrorResponse => {
	const known =
		error instanceof AppError ? error : commonErrors.create('common.internal')
	const ref = errorRef(traceId)
	return {
		status: known.status,
		body: {
			error: {
				code: known.key,
				message: known.publicMessage,
				ref,
				...(known.details && known.status < 500
					? { details: known.details }
					: {})
			}
		}
	}
}

export { errorRef, toErrorResponse }
