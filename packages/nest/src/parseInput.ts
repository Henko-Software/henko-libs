import type { z } from 'zod'

import { commonErrors } from '@henko-software/errors'

/**
 * Lo que entra de afuera es `unknown` hasta pasar por zod. Si no cumple,
 * error de validación con el problema de cada campo, para que el front lo
 * muestre al lado del campo.
 *
 *   @Post() create(@Body() body: unknown) {
 *     const input = parseInput(createContactSchema, body)
 */
const parseInput = <S extends z.ZodType>(
	schema: S,
	value: unknown
): z.output<S> => {
	const result = schema.safeParse(value)
	if (result.success) return result.data
	const fields: Record<string, string> = {}
	for (const issue of result.error.issues) {
		const key = issue.path.join('.') || '_'
		fields[key] ??= issue.message
	}
	throw commonErrors.create('common.validation', { details: { fields } })
}

export { parseInput }
