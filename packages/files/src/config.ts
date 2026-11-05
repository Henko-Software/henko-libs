import { z } from 'zod'

import { S3FileStorage } from './s3.js'
import { type FileStorage, LocalDiskFileStorage } from './storage.js'

/**
 * Las variables de entorno de los archivos, iguales en todos los servicios:
 * `FILES_DRIVER` (`disk` | `s3`), `FILES_DIR` para disco y `FILES_S3_*` para
 * un bucket.
 */
export const fileStorageEnvSchema = z
	.object({
		FILES_DRIVER: z.enum(['disk', 's3']).default('disk'),
		FILES_DIR: z.string().min(1).default('./.files'),
		FILES_S3_ENDPOINT: z.url().optional(),
		FILES_S3_BUCKET: z.string().min(1).optional(),
		FILES_S3_REGION: z.string().min(1).default('us-east-1'),
		FILES_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
		FILES_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
		FILES_S3_PREFIX: z.string().optional()
	})
	.superRefine((env, ctx) => {
		if (env.FILES_DRIVER !== 's3') return
		for (const name of [
			'FILES_S3_ENDPOINT',
			'FILES_S3_BUCKET',
			'FILES_S3_ACCESS_KEY_ID',
			'FILES_S3_SECRET_ACCESS_KEY'
		] as const)
			if (!env[name])
				ctx.addIssue({
					code: 'custom',
					path: [name],
					message: `Con FILES_DRIVER=s3 falta ${name}`
				})
	})

export type FileStorageEnv = z.infer<typeof fileStorageEnvSchema>

/** El adaptador que dice la config. */
export const createFileStorage = (env: FileStorageEnv): FileStorage => {
	if (env.FILES_DRIVER === 'disk')
		return new LocalDiskFileStorage(env.FILES_DIR)
	return new S3FileStorage({
		endpoint: env.FILES_S3_ENDPOINT ?? '',
		bucket: env.FILES_S3_BUCKET ?? '',
		region: env.FILES_S3_REGION,
		accessKeyId: env.FILES_S3_ACCESS_KEY_ID ?? '',
		secretAccessKey: env.FILES_S3_SECRET_ACCESS_KEY ?? '',
		...(env.FILES_S3_PREFIX ? { prefix: env.FILES_S3_PREFIX } : {})
	})
}
