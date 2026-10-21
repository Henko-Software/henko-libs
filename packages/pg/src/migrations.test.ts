import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runMigrations } from './index.js'

const url = process.env.HENKO_TEST_DATABASE_URL

describe.skipIf(!url)('migraciones', () => {
	let pool: pg.Pool
	let dir: string

	beforeAll(async () => {
		pool = new pg.Pool({ connectionString: url })
		await pool.query('DROP TABLE IF EXISTS schema_migrations, mig_a, mig_b')
		dir = await mkdtemp(join(tmpdir(), 'henko-mig-'))
	})

	afterAll(async () => {
		await pool.query('DROP TABLE IF EXISTS schema_migrations, mig_a, mig_b')
		await pool.end()
	})

	it('aplica en orden, una sola vez, y frena si se edita una aplicada', async () => {
		await writeFile(join(dir, '0001_a.sql'), 'CREATE TABLE mig_a (id int);')
		await writeFile(join(dir, '0002_b.sql'), 'CREATE TABLE mig_b (id int);')
		expect(await runMigrations(pool, dir)).toEqual({
			applied: ['0001_a.sql', '0002_b.sql'],
			skipped: []
		})
		expect(await runMigrations(pool, dir)).toEqual({
			applied: [],
			skipped: ['0001_a.sql', '0002_b.sql']
		})
		await writeFile(join(dir, '0001_a.sql'), 'CREATE TABLE mig_a (id bigint);')
		await expect(runMigrations(pool, dir)).rejects.toThrow(/no se editan/i)
	})

	it('una migración que falla no deja nada a medias', async () => {
		await writeFile(
			join(dir, '0003_broken.sql'),
			'CREATE TABLE mig_c (id int); SELECT * FROM no_existe;'
		)
		await writeFile(join(dir, '0001_a.sql'), 'CREATE TABLE mig_a (id int);')
		await expect(runMigrations(pool, dir)).rejects.toThrow(/0003_broken/)
		const { rows } = await pool.query("SELECT to_regclass('mig_c') AS t")
		expect(rows[0]?.t).toBeNull()
	})
})
