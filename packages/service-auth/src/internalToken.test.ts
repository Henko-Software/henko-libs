import { describe, expect, it } from 'vitest'

import {
	createInternalTokenSigner,
	createInternalTokenVerifier,
	generateServiceKeyPair
} from './index.js'

const bff = generateServiceKeyPair()
const intruder = generateServiceKeyPair()
const context = {
	actor: { origin: 'person' as const, id: 'u1', role: 'cajero' },
	localId: 'l1',
	correlationId: 'c1'
}

describe('tokens internos', () => {
	it('el destino recibe el contexto de quien llama', async () => {
		const signer = await createInternalTokenSigner({
			issuer: 'bff',
			privateKeyPem: bff.privateKeyPem
		})
		const verifier = await createInternalTokenVerifier({
			audience: 'identity',
			trustedIssuers: { bff: bff.publicKeyPem }
		})
		const verified = await verifier.verify(
			await signer.sign('identity', context)
		)
		expect(verified).toEqual({
			caller: 'bff',
			...context,
			causationId: undefined
		})
	})

	it('rechaza otra audiencia, un emisor desconocido y una firma ajena', async () => {
		const verifier = await createInternalTokenVerifier({
			audience: 'identity',
			trustedIssuers: { bff: bff.publicKeyPem }
		})
		const signer = await createInternalTokenSigner({
			issuer: 'bff',
			privateKeyPem: bff.privateKeyPem
		})
		await expect(
			verifier.verify(await signer.sign('billing', context))
		).rejects.toThrow()

		const stranger = await createInternalTokenSigner({
			issuer: 'otro',
			privateKeyPem: intruder.privateKeyPem
		})
		await expect(
			verifier.verify(await stranger.sign('identity', context))
		).rejects.toThrow()

		const forged = await createInternalTokenSigner({
			issuer: 'bff',
			privateKeyPem: intruder.privateKeyPem
		})
		await expect(
			verifier.verify(await forged.sign('identity', context))
		).rejects.toThrow()
	})

	it('rechaza un token vencido', async () => {
		const signer = await createInternalTokenSigner({
			issuer: 'bff',
			privateKeyPem: bff.privateKeyPem,
			ttlSeconds: -10
		})
		const verifier = await createInternalTokenVerifier({
			audience: 'identity',
			trustedIssuers: { bff: bff.publicKeyPem }
		})
		await expect(
			verifier.verify(await signer.sign('identity', context))
		).rejects.toThrow()
	})
})
