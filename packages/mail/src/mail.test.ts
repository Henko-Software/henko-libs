import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
	createMailer,
	dirMailer,
	logMailer,
	mailEnvSchema,
	memoryMailer
} from './index.js'

const message = {
	to: 'cliente@example.com',
	subject: 'Factura A 0002-00000001',
	text: 'Hola',
	attachments: [{ filename: 'f.pdf', content: new Uint8Array([1, 2, 3]) }]
}

describe('mail', () => {
	it('el adaptador log no manda: deja a quién y qué', async () => {
		const lines: Record<string, unknown>[] = []
		await logMailer({ info: fields => lines.push(fields) }).send(message)
		expect(lines[0]).toMatchObject({
			mail_to: 'cliente@example.com',
			attachments: [{ filename: 'f.pdf', bytes: 3 }]
		})
	})

	it('memoria guarda lo enviado y puede fallar a pedido', async () => {
		const { mailer, sent, failNext } = memoryMailer()
		failNext()
		await expect(mailer.send(message)).rejects.toThrow()
		await mailer.send(message)
		expect(sent).toHaveLength(1)
	})

	it('la config: log por defecto; smtp sin dirección no arranca', () => {
		const env = mailEnvSchema.parse({})
		expect(env.MAIL_TRANSPORT).toBe('log')
		expect(createMailer(env, { info: () => undefined })).toBeDefined()
		expect(mailEnvSchema.safeParse({ MAIL_TRANSPORT: 'smtp' }).success).toBe(
			false
		)
	})

	it('dir deja el mail entero como JSON en la carpeta', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'henko-mail-'))
		await dirMailer(dir).send(message)
		const [file] = readdirSync(dir)
		expect(file).toBeDefined()
		const saved = JSON.parse(readFileSync(join(dir, file ?? ''), 'utf8'))
		expect(saved).toMatchObject({ to: message.to, text: 'Hola' })
		expect(mailEnvSchema.safeParse({ MAIL_TRANSPORT: 'dir' }).success).toBe(
			false
		)
	})
})
