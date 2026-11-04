import type { z } from 'zod'

/**
 * Mensajes de validación en castellano, escritos para la persona que llena
 * el formulario (no para quien programa): «Escribí un mail válido.», no
 * «Inválido dirección de correo electrónico». Un mensaje propio del schema
 * (`z.string().min(1, 'Poné el nombre.')`) siempre gana.
 *
 * Es el único lugar con estos textos: lo usan `parseInput` de
 * `@henko-software/nest` (identity, BFF y los módulos) y lo puede usar el
 * front con `z.config({ customError: spanishErrorMap })`.
 */

type Issue = z.core.$ZodRawIssue

const FORMAT_MESSAGES: Record<string, string> = {
	email: 'Escribí un mail válido (por ejemplo, nombre@empresa.com).',
	url: 'Escribí una dirección web válida.',
	uuid: 'El identificador no es válido.',
	guid: 'El identificador no es válido.',
	datetime: 'La fecha y hora no son válidas.',
	date: 'La fecha no es válida.',
	time: 'La hora no es válida.',
	duration: 'La duración no es válida.',
	ipv4: 'La dirección IP no es válida.',
	ipv6: 'La dirección IP no es válida.',
	e164: 'Escribí el teléfono con código de país (por ejemplo, +5491112345678).',
	lowercase: 'Tiene que ir en minúsculas.',
	uppercase: 'Tiene que ir en mayúsculas.',
	json_string: 'No es un JSON válido.'
}

const TYPE_MESSAGES: Record<string, string> = {
	string: 'Tiene que ser un texto.',
	number: 'Tiene que ser un número.',
	int: 'Tiene que ser un número entero.',
	bigint: 'Tiene que ser un número entero.',
	boolean: 'Tiene que ser sí o no.',
	date: 'Tiene que ser una fecha.',
	array: 'Tiene que ser una lista.',
	tuple: 'Tiene que ser una lista.',
	set: 'Tiene que ser una lista.',
	object: 'Faltan los datos.',
	record: 'Faltan los datos.',
	map: 'Faltan los datos.',
	file: 'Tiene que ser un archivo.'
}

const INVALID = 'El valor no es válido.'
const REQUIRED = 'Completá este campo.'

const isEmpty = (input: unknown) => input === undefined || input === null

const count = (n: number | bigint, singular: string, plural: string) =>
	`${n.toString()} ${n.toString() === '1' ? singular : plural}`

const tooSmall = (
	origin: string,
	minimum: number | bigint,
	inclusive: boolean,
	exact: boolean
): string => {
	if (origin === 'string') {
		if (exact)
			return `Tiene que tener ${count(minimum, 'carácter', 'caracteres')}.`
		if (Number(minimum) <= 1) return REQUIRED
		return `Tiene que tener al menos ${count(minimum, 'carácter', 'caracteres')}.`
	}
	if (origin === 'array' || origin === 'set') {
		if (exact)
			return `Tienen que ser ${count(minimum, 'elemento', 'elementos')}.`
		if (Number(minimum) <= 1) return 'Elegí al menos uno.'
		return `Elegí al menos ${minimum.toString()}.`
	}
	if (origin === 'date') return 'La fecha es anterior a la permitida.'
	if (origin === 'file') return 'El archivo está vacío o es muy chico.'
	return inclusive
		? `Tiene que ser ${minimum.toString()} o más.`
		: `Tiene que ser mayor que ${minimum.toString()}.`
}

const tooBig = (
	origin: string,
	maximum: number | bigint,
	inclusive: boolean,
	exact: boolean
): string => {
	if (origin === 'string') {
		if (exact)
			return `Tiene que tener ${count(maximum, 'carácter', 'caracteres')}.`
		return `Puede tener hasta ${count(maximum, 'carácter', 'caracteres')}.`
	}
	if (origin === 'array' || origin === 'set') {
		return `Puede tener hasta ${count(maximum, 'elemento', 'elementos')}.`
	}
	if (origin === 'date') return 'La fecha es posterior a la permitida.'
	if (origin === 'file') return 'El archivo es demasiado grande.'
	return inclusive
		? `Tiene que ser ${maximum.toString()} o menos.`
		: `Tiene que ser menor que ${maximum.toString()}.`
}

const invalidFormat = (issue: Issue & { code: 'invalid_format' }): string => {
	if (issue.format === 'starts_with' && typeof issue.prefix === 'string') {
		return `Tiene que empezar con «${issue.prefix}».`
	}
	if (issue.format === 'ends_with' && typeof issue.suffix === 'string') {
		return `Tiene que terminar con «${issue.suffix}».`
	}
	if (issue.format === 'includes' && typeof issue.includes === 'string') {
		return `Tiene que incluir «${issue.includes}».`
	}
	return FORMAT_MESSAGES[issue.format] ?? 'El formato no es válido.'
}

/** El mensaje en castellano para un problema de zod. */
const spanishMessage = (issue: Issue): string => {
	switch (issue.code) {
		case 'invalid_type':
			if (isEmpty(issue.input)) return REQUIRED
			return TYPE_MESSAGES[issue.expected] ?? INVALID
		case 'too_small':
			return tooSmall(
				issue.origin,
				issue.minimum,
				issue.inclusive ?? true,
				issue.exact ?? false
			)
		case 'too_big':
			return tooBig(
				issue.origin,
				issue.maximum,
				issue.inclusive ?? true,
				issue.exact ?? false
			)
		case 'invalid_format':
			return invalidFormat(issue)
		case 'invalid_value':
			if (isEmpty(issue.input)) return REQUIRED
			return 'Elegí una de las opciones.'
		case 'not_multiple_of':
			return `Tiene que ser múltiplo de ${issue.divisor}.`
		case 'unrecognized_keys':
			return issue.keys.length === 1
				? `Sobra el campo «${issue.keys[0] ?? ''}».`
				: `Sobran los campos ${issue.keys.map(k => `«${k}»`).join(', ')}.`
		case 'invalid_union':
			if (isEmpty(issue.input)) return REQUIRED
			return INVALID
		case 'invalid_key':
		case 'invalid_element':
		case 'custom':
			return INVALID
		default:
			return INVALID
	}
}

/** Error map de zod: `schema.safeParse(value, { error: spanishErrorMap })`. */
const spanishErrorMap: z.core.$ZodErrorMap = issue => spanishMessage(issue)

export { spanishErrorMap, spanishMessage }
