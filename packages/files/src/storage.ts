import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

/**
 * Un archivo guardado: los bytes y su tipo (`image/webp`, `application/pdf`…).
 */
export type StoredFile = {
	bytes: Uint8Array
	contentType: string
}

/**
 * Puerto de archivos. Las claves las arma el servicio
 * (`articles/<id>/<uuid>`): segmentos con letras, números, `.`, `_` o `-`,
 * separados por `/`; nada de `..` ni rutas absolutas.
 */
export interface FileStorage {
	put(key: string, file: StoredFile): Promise<void>
	/** `null` si no está. */
	get(key: string): Promise<StoredFile | null>
	/** Sin error si no estaba. */
	delete(key: string): Promise<void>
}

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/

/** Tira si la clave no es segura (vacía, absoluta, con `..`, `\` o segmentos raros). */
export const assertSafeKey = (key: string): void => {
	const segments = key.split('/')
	const ok =
		key.length > 0 &&
		key.length <= 512 &&
		segments.every(segment => SEGMENT.test(segment) && segment !== '..')
	if (!ok) throw new Error(`Clave de archivo inválida: ${key}`)
}

const DEFAULT_TYPE = 'application/octet-stream'

/** El tipo se guarda al lado del archivo (`<clave>.type`), así el disco no adivina. */
const TYPE_SUFFIX = '.type'

const isMissing = (error: unknown) =>
	typeof error === 'object' &&
	error !== null &&
	'code' in error &&
	error.code === 'ENOENT'

/**
 * Archivos en una carpeta del disco. Para desarrollo y una instancia chica;
 * con más de una réplica va un bucket (`S3FileStorage`) detrás del mismo
 * puerto.
 */
export class LocalDiskFileStorage implements FileStorage {
	private readonly root: string

	constructor(root: string) {
		this.root = resolve(root)
	}

	private path(key: string) {
		assertSafeKey(key)
		return join(this.root, key)
	}

	async put(key: string, file: StoredFile) {
		const path = this.path(key)
		await mkdir(dirname(path), { recursive: true })
		await writeFile(path, file.bytes)
		await writeFile(path + TYPE_SUFFIX, file.contentType)
	}

	async get(key: string) {
		const path = this.path(key)
		try {
			const bytes = new Uint8Array(await readFile(path))
			let contentType = DEFAULT_TYPE
			try {
				contentType = (await readFile(path + TYPE_SUFFIX, 'utf8')).trim()
			} catch (error) {
				if (!isMissing(error)) throw error
			}
			return { bytes, contentType }
		} catch (error) {
			if (isMissing(error)) return null
			throw error
		}
	}

	async delete(key: string) {
		const path = this.path(key)
		await rm(path, { force: true })
		await rm(path + TYPE_SUFFIX, { force: true })
	}
}

/** En memoria (tests). */
export class MemoryFileStorage implements FileStorage {
	readonly files = new Map<string, StoredFile>()

	put(key: string, file: StoredFile) {
		return Promise.resolve().then(() => {
			assertSafeKey(key)
			this.files.set(key, file)
		})
	}

	get(key: string) {
		return Promise.resolve().then(() => {
			assertSafeKey(key)
			return this.files.get(key) ?? null
		})
	}

	delete(key: string) {
		return Promise.resolve().then(() => {
			assertSafeKey(key)
			this.files.delete(key)
		})
	}
}
