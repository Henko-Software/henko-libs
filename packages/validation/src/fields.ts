import type { z } from 'zod'

import { spanishErrorMap } from './spanish.js'

/** El problema de cada campo, por su ruta (`items.0.price`); `_` = el todo. */
export type FieldErrors = Record<string, string>

/**
 * Un mensaje por campo (el primero), para mostrarlo al lado del campo. Es
 * lo que va en `details.fields` de `common.validation`.
 */
const fieldErrors = (error: z.ZodError): FieldErrors => {
	const fields: FieldErrors = {}
	for (const issue of error.issues) {
		const key = issue.path.map(String).join('.') || '_'
		fields[key] ??= issue.message
	}
	return fields
}

/**
 * Valida con mensajes en castellano. Devuelve los datos o los errores por
 * campo, sin tirar.
 */
const validate = <S extends z.ZodType>(
	schema: S,
	value: unknown
):
	| { success: true; data: z.output<S> }
	| { success: false; fields: FieldErrors } => {
	const result = schema.safeParse(value, { error: spanishErrorMap })
	return result.success
		? { success: true, data: result.data }
		: { success: false, fields: fieldErrors(result.error) }
}

export { fieldErrors, validate }
