import { headers as natsHeaders, type JetStreamClient } from 'nats'

import type { BusMessage, MessageBus } from './bus.js'

/**
 * Bus sobre NATS JetStream. El subject es el tipo del evento
 * (`contacts.contact.created.v1`) y el id va como `Nats-Msg-Id`, así
 * JetStream descarta un mensaje repetido si el relay reintenta.
 */
class NatsMessageBus implements MessageBus {
	constructor(private readonly jetstream: JetStreamClient) {}

	async publish(message: BusMessage): Promise<void> {
		const headers = natsHeaders()
		for (const [key, value] of Object.entries(message.headers)) {
			headers.set(key, value)
		}
		await this.jetstream.publish(
			message.subject,
			new TextEncoder().encode(message.data),
			{ msgID: message.id, headers }
		)
	}
}

export { NatsMessageBus }
