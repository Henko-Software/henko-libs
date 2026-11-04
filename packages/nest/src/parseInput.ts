import type { z } from 'zod'

import { commonErrors } from '@henko-software/errors'
import { validate } from '@henko-software/validation'

/**
 * Lo que entra de afuera es `unknown` hasta pasar por zod. Si no cumple,
 * error de validación con el problema de cada campo, para que el front lo
 * muestre al lado del campo. Los mensajes salen en castellano, escritos
 * para la persona (`@henko-software/validation`); un mensaje propio del
 * schema siempre gana.
 *
 *   @Post() create(@Body() body: unknown) {
 *     const input = parseInput(createContactSchema, body)
 */
const parseInput = <S extends z.ZodType>(
	schema: S,
	value: unknown
): z.output<S> => {
	const result = validate(schema, value)
	if (result.success) return result.data
	throw commonErrors.create('common.validation', {
		details: { fields: result.fields }
	})
}

export { parseInput }
