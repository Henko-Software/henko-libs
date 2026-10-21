import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Pool } from 'pg'

export type MigrationResult = { applied: string[]; skipped: string[] }

/**
 * Corre las migraciones `.sql` de una carpeta, en orden de nombre
 * (`0001_users.sql`, `0002_sessions.sql`…), cada una en su transacción. Se
 * anotan en `schema_migrations` con su checksum: si una migración ya aplicada
 * cambió, falla. Nunca se edita una migración aplicada: se agrega otra.
 *
 * Corre con el rol dueño del schema (`<svc>_owner`), no con el del servicio.
 */
const runMigrations = async (
	pool: Pool,
	dir: string
): Promise<MigrationResult> => {
	await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
		name text PRIMARY KEY,
		checksum text NOT NULL,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`)
	const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()
	const { rows } = await pool.query<{ name: string; checksum: string }>(
		'SELECT name, checksum FROM schema_migrations'
	)
	const done = new Map(rows.map(r => [r.name, r.checksum]))
	const result: MigrationResult = { applied: [], skipped: [] }

	for (const file of files) {
		const sql = await readFile(join(dir, file), 'utf8')
		const checksum = createHash('sha256').update(sql).digest('hex')
		const previous = done.get(file)
		if (previous) {
			if (previous !== checksum) {
				throw new Error(
					`La migración ${file} ya estaba aplicada y cambió. No se editan migraciones aplicadas: agregá una nueva.`
				)
			}
			result.skipped.push(file)
			continue
		}
		const client = await pool.connect()
		try {
			await client.query('BEGIN')
			await client.query(sql)
			await client.query(
				'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
				[file, checksum]
			)
			await client.query('COMMIT')
			result.applied.push(file)
		} catch (error) {
			await client.query('ROLLBACK')
			throw new Error(`Falló la migración ${file}`, { cause: error })
		} finally {
			client.release()
		}
	}
	return result
}

export { runMigrations }
