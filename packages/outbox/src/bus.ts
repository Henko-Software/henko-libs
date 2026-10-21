/** Un mensaje listo para el bus. `id` sirve para que el bus descarte duplicados. */
export type BusMessage = {
	id: string
	subject: string
	data: string
	headers: Record<string, string>
}

/** Puerto del bus de mensajes. Adaptadores: NATS JetStream, memoria. */
export interface MessageBus {
	publish(message: BusMessage): Promise<void>
}
