import { AwsClient } from 'aws4fetch'

import { assertSafeKey, type FileStorage, type StoredFile } from './storage.js'

export type S3Config = {
	/** `https://s3.us-east-1.amazonaws.com`, `https://<cuenta>.r2.cloudflarestorage.com`, `http://localhost:9000` (MinIO)… */
	endpoint: string
	bucket: string
	region: string
	accessKeyId: string
	secretAccessKey: string
	/** Carpeta dentro del bucket (p. ej. el nombre del servicio). */
	prefix?: string
}

type Fetch = (request: Request) => Promise<Response>

/**
 * Archivos en un bucket S3-compatible (AWS, R2, MinIO…), con el path-style
 * (`<endpoint>/<bucket>/<clave>`) que entienden todos. Firma SigV4 con
 * `aws4fetch`, sin el SDK de AWS.
 */
export class S3FileStorage implements FileStorage {
	private readonly client: AwsClient
	private readonly base: string
	private readonly prefix: string

	constructor(
		config: S3Config,
		private readonly fetchFn: Fetch = request => fetch(request)
	) {
		this.client = new AwsClient({
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
			region: config.region,
			service: 's3'
		})
		this.base = `${config.endpoint.replace(/\/+$/, '')}/${encodeURIComponent(config.bucket)}`
		this.prefix = config.prefix ? config.prefix.replace(/^\/+|\/+$/g, '') : ''
	}

	private url(key: string) {
		assertSafeKey(key)
		const full = this.prefix ? `${this.prefix}/${key}` : key
		return `${this.base}/${full.split('/').map(encodeURIComponent).join('/')}`
	}

	private async send(url: string, init: RequestInit) {
		return this.fetchFn(await this.client.sign(url, init))
	}

	async put(key: string, file: StoredFile) {
		const response = await this.send(this.url(key), {
			method: 'PUT',
			body: file.bytes,
			headers: { 'content-type': file.contentType }
		})
		if (!response.ok)
			throw new Error(
				`S3 PUT ${key}: ${response.status} ${await response.text()}`
			)
	}

	async get(key: string) {
		const response = await this.send(this.url(key), { method: 'GET' })
		if (response.status === 404) return null
		if (!response.ok)
			throw new Error(
				`S3 GET ${key}: ${response.status} ${await response.text()}`
			)
		return {
			bytes: new Uint8Array(await response.arrayBuffer()),
			contentType:
				response.headers.get('content-type') ?? 'application/octet-stream'
		}
	}

	async delete(key: string) {
		const response = await this.send(this.url(key), { method: 'DELETE' })
		if (!response.ok && response.status !== 404)
			throw new Error(
				`S3 DELETE ${key}: ${response.status} ${await response.text()}`
			)
	}
}
