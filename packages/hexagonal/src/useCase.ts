import { withSpan } from '@henko-software/tracing'

import type { TransactionRunner } from './ports.js'

/**
 * Base de todo caso de uso: una operación de negocio, en su propia
 * transacción y su propio span (`usecase contacts.create`), así aparece con
 * nombre en la traza.
 *
 *   class CreateContact extends UseCase<CreateContactInput, Contact> {
 *     readonly name = 'contacts.create'
 *     constructor(tx: TransactionRunner, private readonly contacts: ContactRepository,
 *                 private readonly audit: AuditTrail<ContactAction>) { super(tx) }
 *     protected async handle(input: CreateContactInput) { … }
 *   }
 */
abstract class UseCase<I, O> {
	abstract readonly name: string

	constructor(private readonly transactions?: TransactionRunner) {}

	protected abstract handle(input: I): Promise<O>

	execute(input: I): Promise<O> {
		return withSpan(
			`usecase ${this.name}`,
			() =>
				this.transactions
					? this.transactions.run(() => this.handle(input))
					: this.handle(input),
			{ 'henko.use_case': this.name }
		)
	}
}

export { UseCase }
