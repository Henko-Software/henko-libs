import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const packagesDir = fileURLToPath(new URL('./packages', import.meta.url))

// Entre paquetes del repo, los tests usan el código fuente: sin build previo.
const alias = Object.fromEntries(
	readdirSync(packagesDir).map(name => [
		`@henko-software/${name}`,
		`${packagesDir}/${name}/src/index.ts`
	])
)

export default defineConfig({
	resolve: { alias },
	test: {
		include: ['packages/*/src/**/*.test.ts'],
		// Los tests de Postgres comparten una base: uno por vez.
		fileParallelism: false
	}
})
