import {
	type Attributes,
	context,
	propagation,
	type Span,
	SpanStatusCode,
	trace
} from '@opentelemetry/api'

const tracer = () => trace.getTracer('henko')

/** El trace id activo, si hay una traza en curso. */
const currentTraceId = (): string | undefined => {
	const spanContext = trace.getActiveSpan()?.spanContext()
	return spanContext && trace.isSpanContextValid(spanContext)
		? spanContext.traceId
		: undefined
}

/** El span id activo, si hay. */
const currentSpanId = (): string | undefined => {
	const spanContext = trace.getActiveSpan()?.spanContext()
	return spanContext && trace.isSpanContextValid(spanContext)
		? spanContext.spanId
		: undefined
}

/**
 * Corre `work` dentro de un span. Si falla, el span queda en error con la
 * excepción registrada y el error sigue su camino.
 */
const withSpan = <T>(
	name: string,
	work: (span: Span) => Promise<T>,
	attributes: Attributes = {}
): Promise<T> =>
	tracer().startActiveSpan(name, { attributes }, async span => {
		try {
			return await work(span)
		} catch (error) {
			span.recordException(
				error instanceof Error ? error : new Error(String(error))
			)
			span.setStatus({ code: SpanStatusCode.ERROR })
			throw error
		} finally {
			span.end()
		}
	})

/**
 * Cabeceras con la traza activa (`traceparent`), para guardarlas con un
 * evento o mandarlas por el bus. Así la traza sigue del otro lado.
 */
const injectTraceHeaders = (): Record<string, string> => {
	const carrier: Record<string, string> = {}
	propagation.inject(context.active(), carrier)
	return carrier
}

/** Corre `work` como continuación de la traza que vino en las cabeceras. */
const withRemoteContext = <T>(
	headers: Record<string, string>,
	work: () => T
): T => context.with(propagation.extract(context.active(), headers), work)

export {
	currentSpanId,
	currentTraceId,
	injectTraceHeaders,
	withRemoteContext,
	withSpan
}
