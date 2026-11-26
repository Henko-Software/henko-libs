import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer from 'nodemailer'
import { z } from 'zod'

/** Un adjunto: el PDF de una factura, un recibo… */
export type MailAttachment = {
	filename: string
	content: Uint8Array
	/** Por defecto `application/pdf`. */
	contentType?: string
}

/** Un mail con adjuntos. */
export type MailMessage = {
	to: string
	subject: string
	text: string
	attachments: MailAttachment[]
}

/** Puerto: manda mails (adaptadores: log en desarrollo, SMTP en un servidor, memoria en tests). */
export interface Mailer {
	send(message: MailMessage): Promise<void>
}

/** Lo que el adaptador log necesita del logger (cualquier pino sirve). */
export type MailLogger = {
	info(fields: Record<string, unknown>, message: string): void
}

/** Desarrollo: no manda nada, deja en el log a quién y qué. */
export const logMailer = (logger: MailLogger): Mailer => ({
	send: message => {
		logger.info(
			{
				mail_to: message.to,
				subject: message.subject,
				attachments: message.attachments.map(a => ({
					filename: a.filename,
					bytes: a.content.byteLength
				}))
			},
			'Mail (adaptador log: no se mandó)'
		)
		return Promise.resolve()
	}
})

/** Un servidor SMTP (`smtps://usuario:clave@host:465`). */
export const smtpMailer = (url: string, from: string): Mailer => {
	const transport = nodemailer.createTransport(url)
	return {
		send: async message => {
			await transport.sendMail({
				from,
				to: message.to,
				subject: message.subject,
				text: message.text,
				attachments: message.attachments.map(a => ({
					filename: a.filename,
					content: Buffer.from(a.content),
					contentType: a.contentType ?? 'application/pdf'
				}))
			})
		}
	}
}

/**
 * Desarrollo y e2e: no manda nada, deja cada mail entero (con el texto, que
 * puede llevar links de un solo uso) como JSON en una carpeta local. Sirve
 * para abrir el link de una invitación o de «olvidé mi contraseña» sin SMTP.
 * Nunca en un servidor: la carpeta tiene secretos.
 */
export const dirMailer = (dir: string): Mailer => {
	mkdirSync(dir, { recursive: true })
	let sequence = 0
	return {
		send: message => {
			sequence += 1
			const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${String(sequence).padStart(4, '0')}.json`
			writeFileSync(
				join(dir, name),
				JSON.stringify(
					{
						to: message.to,
						subject: message.subject,
						text: message.text,
						attachments: message.attachments.map(a => ({
							filename: a.filename,
							bytes: a.content.byteLength
						}))
					},
					null,
					2
				)
			)
			return Promise.resolve()
		}
	}
}

/** Tests: guarda lo que se mandó; `failNext(n)` hace fallar los próximos n envíos. */
export const memoryMailer = () => {
	const sent: MailMessage[] = []
	let failures = 0
	const mailer: Mailer = {
		send: message => {
			if (failures > 0) {
				failures -= 1
				return Promise.reject(new Error('Falla simulada del servidor de mail'))
			}
			sent.push(message)
			return Promise.resolve()
		}
	}
	return {
		mailer,
		sent,
		failNext: (times = 1) => {
			failures = times
		}
	}
}

/**
 * Las variables de entorno del mail, iguales en todos los servicios:
 * `MAIL_TRANSPORT` (`log` | `smtp` | `dir`), `MAIL_SMTP_URL`, `MAIL_DIR` y
 * `MAIL_FROM`.
 */
export const mailEnvSchema = z
	.object({
		MAIL_TRANSPORT: z.enum(['log', 'smtp', 'dir']).default('log'),
		MAIL_SMTP_URL: z.string().min(1).optional(),
		/** Con `MAIL_TRANSPORT=dir`: la carpeta donde quedan los mails. */
		MAIL_DIR: z.string().min(1).optional(),
		MAIL_FROM: z.string().min(1).default('Henko <no-responder@henko.local>')
	})
	.refine(env => env.MAIL_TRANSPORT !== 'smtp' || Boolean(env.MAIL_SMTP_URL), {
		path: ['MAIL_SMTP_URL'],
		message: 'Con MAIL_TRANSPORT=smtp falta MAIL_SMTP_URL'
	})
	.refine(env => env.MAIL_TRANSPORT !== 'dir' || Boolean(env.MAIL_DIR), {
		path: ['MAIL_DIR'],
		message: 'Con MAIL_TRANSPORT=dir falta MAIL_DIR'
	})

export type MailEnv = z.infer<typeof mailEnvSchema>

/** El adaptador que dice la config. */
export const createMailer = (env: MailEnv, logger: MailLogger): Mailer => {
	if (env.MAIL_TRANSPORT === 'smtp' && env.MAIL_SMTP_URL) {
		return smtpMailer(env.MAIL_SMTP_URL, env.MAIL_FROM)
	}
	if (env.MAIL_TRANSPORT === 'dir' && env.MAIL_DIR)
		return dirMailer(env.MAIL_DIR)
	return logMailer(logger)
}
