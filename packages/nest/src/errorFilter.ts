import {
	type ArgumentsHost,
	Catch,
	type ExceptionFilter,
	HttpException
} from '@nestjs/common'

import { AppError, commonErrors, toErrorResponse } from '@henko-software/errors'
import type { Logger } from '@henko-software/logger'
import { currentTraceId } from '@henko-software/tracing'

import type { HttpResponse } from './contextMiddleware.js'

const fromHttpStatus = (status: number): AppError => {
	if (status === 401) return commonErrors.create('common.unauthenticated')
	if (status === 403) return commonErrors.create('common.forbidden')
	if (status === 404) return commonErrors.create('common.not_found')
	if (status === 409) return commonErrors.create('common.conflict')
	if (status >= 400 && status < 500)
		return commonErrors.create('common.validation')
	return commonErrors.create('common.internal')
}

/**
 * Todo error sale igual: `{ error: { code, message, ref, details? } }`. El
 * `ref` (H-4BF92F) es lo que ve la persona y lo que se busca en la Console.
 * Los 5xx se loguean como error con el detalle interno; al cliente nunca le
 * llega.
 */
@Catch()
class HenkoErrorFilter implements ExceptionFilter {
	constructor(private readonly logger: Logger) {}

	catch(exception: unknown, host: ArgumentsHost): void {
		const known =
			exception instanceof AppError
				? exception
				: exception instanceof HttpException
					? fromHttpStatus(exception.getStatus())
					: exception
		const { status, body } = toErrorResponse(known, currentTraceId())
		const log = {
			error_code: body.error.ref,
			error_key: body.error.code,
			status,
			err: exception
		}
		if (status >= 500) this.logger.error(log, 'Error del servidor')
		else this.logger.warn(log, 'Error del cliente')
		host.switchToHttp().getResponse<HttpResponse>().status(status).json(body)
	}
}

export { HenkoErrorFilter }
