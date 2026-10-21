import { generateKeyPairSync } from 'node:crypto'
import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose'
import { z } from 'zod'

import type { RequestContext } from '@henko-software/core'

/**
 * Entre servicios nadie confía por estar en la misma red. Cada llamada lleva
 * un token interno, corto (60 s), firmado por el servicio que llama y con el
 * servicio destino como audiencia. Adentro viaja el contexto: quién es la
 * persona (o el proceso), su rol en ese momento, el local y la correlación.
 * Nunca cabeceras sueltas como `x-user-id`.
 */

const ALG = 'EdDSA'

const actorSchema = z.discriminatedUnion('origin', [
	z.object({
		origin: z.literal('person'),
		id: z.string().min(1),
		name: z.string().optional(),
		role: z.string().min(1)
	}),
	z.object({ origin: z.literal('automatic'), label: z.string().min(1) })
])

const claimsSchema = z.object({
	iss: z.string(),
	aud: z.union([z.string(), z.array(z.string())]),
	actor: actorSchema,
	localId: z.string().optional(),
	correlationId: z.string().optional(),
	causationId: z.string().optional()
})

export type VerifiedContext = RequestContext & {
	/** El servicio que llamó (`bff`, `orchestrator`). */
	caller: string
}

export type SignerOptions = {
	/** Nombre del servicio que firma: `bff`. */
	issuer: string
	/** Clave privada Ed25519 en PEM (PKCS8). Va como secreto, en archivo. */
	privateKeyPem: string
	ttlSeconds?: number
}

const createInternalTokenSigner = async ({
	issuer,
	privateKeyPem,
	ttlSeconds = 60
}: SignerOptions) => {
	const key = await importPKCS8(privateKeyPem, ALG)
	return {
		/** Token para llamar a `audience` en nombre del contexto dado. */
		sign: (audience: string, context: RequestContext): Promise<string> =>
			new SignJWT({
				actor: context.actor,
				localId: context.localId,
				correlationId: context.correlationId,
				causationId: context.causationId
			})
				.setProtectedHeader({ alg: ALG })
				.setIssuer(issuer)
				.setAudience(audience)
				.setIssuedAt()
				.setExpirationTime(`${ttlSeconds}s`)
				.sign(key)
	}
}

export type VerifierOptions = {
	/** El servicio que verifica: `identity`. */
	audience: string
	/** Servicios en los que confía, con su clave pública Ed25519 en PEM (SPKI). */
	trustedIssuers: Record<string, string>
}

const createInternalTokenVerifier = async ({
	audience,
	trustedIssuers
}: VerifierOptions) => {
	const keys = new Map(
		await Promise.all(
			Object.entries(trustedIssuers).map(
				async ([issuer, pem]) => [issuer, await importSPKI(pem, ALG)] as const
			)
		)
	)
	return {
		/** Verifica firma, emisor, audiencia y vencimiento. Si algo no da, falla. */
		verify: async (token: string): Promise<VerifiedContext> => {
			const { payload } = await jwtVerify(
				token,
				async header => {
					const unverified = JSON.parse(
						Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()
					) as { iss?: unknown }
					const key =
						typeof unverified.iss === 'string'
							? keys.get(unverified.iss)
							: undefined
					if (!key || header.alg !== ALG) {
						throw new Error('Emisor no confiable')
					}
					return key
				},
				{ audience, issuer: [...keys.keys()], algorithms: [ALG] }
			)
			const claims = claimsSchema.parse(payload)
			return {
				caller: claims.iss,
				actor: claims.actor,
				localId: claims.localId,
				correlationId: claims.correlationId,
				causationId: claims.causationId
			}
		}
	}
}

/** Par de claves Ed25519 nuevo, para dar de alta un servicio. */
const generateServiceKeyPair = () => {
	const { privateKey, publicKey } = generateKeyPairSync('ed25519')
	return {
		privateKeyPem: privateKey
			.export({ type: 'pkcs8', format: 'pem' })
			.toString(),
		publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString()
	}
}

export {
	createInternalTokenSigner,
	createInternalTokenVerifier,
	generateServiceKeyPair
}
