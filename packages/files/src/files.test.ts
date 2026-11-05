import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
	assertSafeKey,
	createFileStorage,
	fileFromDataUrl,
	fileStorageEnvSchema,
	LocalDiskFileStorage,
	MemoryFileStorage,
	S3FileStorage,
	sniffContentType
} from './index.js'

const PNG = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0
])
const dirs: string[] = []

afterAll(async () => {
	for (const dir of dirs) await rm(dir, { recursive: true, force: true })
})

describe('claves', () => {
	it('acepta las que arma un servicio y frena las peligrosas', () => {
		expect(() => assertSafeKey('articles/0190-ab/photo.webp')).not.toThrow()
		for (const bad of [
			'',
			'/etc/passwd',
			'a/../b',
			'..',
			'a//b',
			'a\\b',
			'.hidden'
		])
			expect(() => assertSafeKey(bad), bad).toThrow()
	})
})

describe('disco local', () => {
	it('guarda, lee con su tipo y borra', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'henko-files-'))
		dirs.push(dir)
		const storage = new LocalDiskFileStorage(dir)
		await storage.put('receptions/r1/photo', {
			bytes: PNG,
			contentType: 'image/png'
		})
		expect(await storage.get('receptions/r1/photo')).toEqual({
			bytes: PNG,
			contentType: 'image/png'
		})
		await storage.delete('receptions/r1/photo')
		await storage.delete('receptions/r1/photo')
		expect(await storage.get('receptions/r1/photo')).toBeNull()
	})
})

describe('memoria', () => {
	it('mismo contrato', async () => {
		const storage = new MemoryFileStorage()
		await storage.put('a/b', { bytes: PNG, contentType: 'image/png' })
		expect((await storage.get('a/b'))?.contentType).toBe('image/png')
		await expect(
			storage.put('../x', { bytes: PNG, contentType: 'x' })
		).rejects.toThrow()
	})
})

describe('S3', () => {
	it('firma y manda path-style con el prefijo; 404 es null', async () => {
		const calls: Request[] = []
		const storage = new S3FileStorage(
			{
				endpoint: 'http://localhost:9000/',
				bucket: 'henko',
				region: 'us-east-1',
				accessKeyId: 'k',
				secretAccessKey: 's',
				prefix: 'catalog'
			},
			request => {
				calls.push(request)
				if (request.method === 'GET')
					return Promise.resolve(new Response(null, { status: 404 }))
				return Promise.resolve(new Response(null, { status: 200 }))
			}
		)
		await storage.put('articles/1/p', { bytes: PNG, contentType: 'image/png' })
		expect(await storage.get('articles/1/p')).toBeNull()
		await storage.delete('articles/1/p')
		expect(calls.map(c => `${c.method} ${c.url}`)).toEqual([
			'PUT http://localhost:9000/henko/catalog/articles/1/p',
			'GET http://localhost:9000/henko/catalog/articles/1/p',
			'DELETE http://localhost:9000/henko/catalog/articles/1/p'
		])
		expect(calls[0]?.headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256/)
	})
})

describe('config y contenido', () => {
	it('disco por defecto; s3 sin datos no arranca', () => {
		const env = fileStorageEnvSchema.parse({})
		expect(createFileStorage(env)).toBeInstanceOf(LocalDiskFileStorage)
		expect(fileStorageEnvSchema.safeParse({ FILES_DRIVER: 's3' }).success).toBe(
			false
		)
	})

	it('un data URL del celular se vuelve archivo con el tipo de sus bytes', () => {
		const url = `data:image/jpeg;base64,${Buffer.from(PNG).toString('base64')}`
		expect(fileFromDataUrl(url)?.contentType).toBe('image/png')
		expect(fileFromDataUrl('data:text/plain;base64,aG9sYQ==')).toBeNull()
		expect(fileFromDataUrl('https://x/y.png')).toBeNull()
		expect(sniffContentType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBe(
			'application/pdf'
		)
	})
})
