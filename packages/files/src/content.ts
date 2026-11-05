import type { StoredFile } from './storage.js'

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0) =>
	signature.every((byte, i) => bytes[at + i] === byte)

/**
 * El tipo de una imagen o un PDF por sus primeros bytes (no por lo que
 * dice quien la manda). `null` si no es JPEG, PNG, WebP, GIF, HEIC o PDF.
 */
export const sniffContentType = (bytes: Uint8Array): string | null => {
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png'
	if (
		startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
		startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
	)
		return 'image/webp'
	if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
	if (startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4)) {
		const brand = String.fromCharCode(...bytes.slice(8, 12))
		if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) return 'image/heic'
	}
	if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf'
	return null
}

const DATA_URL =
	/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?(;[a-z0-9-]+=[^;,]*)*;base64,([A-Za-z0-9+/=\s]*)$/i

/**
 * Un `data:…;base64,…` (lo que manda el celular) como archivo. El tipo sale
 * de los bytes; `null` si no es base64 o no es un tipo conocido.
 */
export const fileFromDataUrl = (dataUrl: string): StoredFile | null => {
	const match = DATA_URL.exec(dataUrl)
	if (!match) return null
	const bytes = new Uint8Array(Buffer.from(match[3] ?? '', 'base64'))
	const contentType = sniffContentType(bytes)
	if (!contentType || bytes.byteLength === 0) return null
	return { bytes, contentType }
}

/** `true` si el texto es un data URL (para separar lo que hay que subir de lo que ya es una dirección). */
export const isDataUrl = (value: string) => value.startsWith('data:')
