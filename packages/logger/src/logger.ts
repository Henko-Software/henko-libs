import pino, { type DestinationStream, type Logger } from 'pino'

import { getContext } from '@henko-software/core'
import { currentSpanId, currentTraceId } from '@henko-software/tracing'

/**
 * Lo que nunca se loguea en claro. Se suman con `redact` si un servicio
 * tiene campos propios.
 */
const DEFAULT_REDACT = [
	'password',
	'*.password',
	'token',
	'*.token',
	'*.accessToken',
	'*.refreshToken',
	'authorization',
	'*.authorization',
	'*.headers.authorization',
	'*.headers.cookie',
	'*.cuit',
	'*.taxId',
	'*.email',
	'*.phone',
	'*.cardNumber'
]

export type LoggerOptions = {
	service: string
	version: string
	instance: string
	level?: string
	redact?: string[]
	/** Para tests: a dónde escribir. Por defecto, stdout. */
	destination?: DestinationStream
}

/**
 * Logger JSON de un servicio. Cada línea lleva servicio, versión e instancia,
 * y además —si hay— la traza, el span, el actor, el local y la correlación
 * del request en curso, sin pasarlos a mano.
 */
const createLogger = ({
	service,
	version,
	instance,
	level = 'info',
	redact = [],
	destination
}: LoggerOptions): Logger =>
	pino(
		{
			level,
			base: { service, version, instance },
			timestamp: pino.stdTimeFunctions.isoTime,
			formatters: { level: label => ({ level: label }) },
			redact: { paths: [...DEFAULT_REDACT, ...redact], censor: '[oculto]' },
			mixin: () => {
				const context = getContext()
				const actor = context?.actor
				return {
					trace_id: currentTraceId(),
					span_id: currentSpanId(),
					local_id: context?.localId,
					correlation_id: context?.correlationId,
					actor:
						actor?.origin === 'person'
							? { id: actor.id, role: actor.role, origin: 'person' }
							: actor
								? { label: actor.label, origin: 'automatic' }
								: undefined
				}
			}
		},
		destination
	)

export { createLogger, DEFAULT_REDACT }
