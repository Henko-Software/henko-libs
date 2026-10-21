import { randomBytes } from 'node:crypto'

/**
 * UUIDv7: ordena por tiempo y lo genera quien crea el dato, no la base. Es lo
 * que permite crear cosas sin internet y reintentar sin duplicar.
 */
const uuidv7 = (now: number = Date.now()): string => {
	const bytes = randomBytes(16)
	const ms = BigInt(now)
	for (let i = 0; i < 6; i++) {
		bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn)
	}
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
	const hex = bytes.toString('hex')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export { uuidv7 }
