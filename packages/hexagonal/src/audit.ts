/**
 * Catálogo de acciones auditables de un módulo, con su nombre legible. Una
 * acción sin nombre no compila, y la pantalla de auditoría usa este nombre.
 *
 *   export const contactActions = defineAuditActions({
 *     'contacts.contact.created': 'Alta de contacto',
 *     'contacts.contact.roles_changed': 'Cambio de roles de un contacto'
 *   })
 *   export type ContactAction = keyof typeof contactActions.catalog
 */
const defineAuditActions = <C extends Record<string, string>>(catalog: C) => ({
	catalog,
	label: (action: keyof C & string): string => catalog[action] ?? action
})

type Snapshot = Record<string, unknown> | null | undefined

/**
 * Deja sólo los campos que cambiaron entre antes y después. En auditoría no
 * se guarda la fila entera.
 */
const diffFields = (
	before: Snapshot,
	after: Snapshot
): {
	before: Record<string, unknown> | null
	after: Record<string, unknown> | null
} => {
	if (!before || !after) return { before: before ?? null, after: after ?? null }
	const changedBefore: Record<string, unknown> = {}
	const changedAfter: Record<string, unknown> = {}
	for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
		if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
			changedBefore[key] = before[key]
			changedAfter[key] = after[key]
		}
	}
	return { before: changedBefore, after: changedAfter }
}

export { defineAuditActions, diffFields }
