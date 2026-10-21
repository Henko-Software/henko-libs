import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { NodeSDK } from '@opentelemetry/sdk-node'
import {
	ATTR_SERVICE_NAME,
	ATTR_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions'

export type TracingOptions = {
	/** `identity`, `bff`, `orchestrator`… */
	serviceName: string
	serviceVersion: string
	/** Cliente al que pertenece la instancia (`bigpizza`, `dev`). */
	instance: string
	/**
	 * Colector OTLP (HTTP). Por defecto lee `OTEL_EXPORTER_OTLP_ENDPOINT`; en
	 * desarrollo, el de henko-infra (http://localhost:4318).
	 */
	otlpEndpoint?: string
}

/**
 * Arranca OpenTelemetry en el proceso. Va lo primero en `main.ts`, antes de
 * importar Nest, pg o http, para que la autoinstrumentación los alcance.
 * Devuelve la función para apagarlo prolijo al cerrar.
 */
const initTracing = ({
	serviceName,
	serviceVersion,
	instance,
	otlpEndpoint
}: TracingOptions): (() => Promise<void>) => {
	const sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: serviceName,
			[ATTR_SERVICE_VERSION]: serviceVersion,
			'henko.instance': instance
		}),
		traceExporter: new OTLPTraceExporter(
			otlpEndpoint ? { url: `${otlpEndpoint}/v1/traces` } : {}
		),
		instrumentations: [
			getNodeAutoInstrumentations({
				// Ruido: cada lectura de archivo sería un span.
				'@opentelemetry/instrumentation-fs': { enabled: false }
			})
		]
	})
	sdk.start()
	return () => sdk.shutdown()
}

export { initTracing }
