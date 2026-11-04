import {
	isEffectiveSuperadmin,
	type RequestContext,
	SUPERADMIN_ROLE
} from './context.js'

/**
 * Lo que hace un superadmin sólo lo ve un superadmin. El único lugar donde se
 * decide si quien mira puede ver el rastro de alguien (filas de auditoría,
 * «creado/editado por», historiales, notificaciones, métricas por persona):
 * todo listado que muestre quién hizo algo pasa por acá.
 *
 * Se decide con el **rol congelado del autor real** (el `actor_role` de la
 * auditoría, que en «ver como» es `superadmin`), así lo hecho viendo como
 * otro rol tampoco aparece. Y quien mira tiene que ser un superadmin real
 * sin «ver como»: viendo como otro rol, el superadmin tampoco lo ve.
 *
 * El dato queda; lo que se esconde es quién.
 */
const canSeeTrailOf = (
	authorRole: string | null | undefined,
	context?: RequestContext
): boolean => authorRole !== SUPERADMIN_ROLE || isEffectiveSuperadmin(context)

/** Saca las filas cuyo autor no se puede ver (auditoría, historiales). */
const visibleTrail = <T>(
	rows: readonly T[],
	authorRoleOf: (row: T) => string | null | undefined,
	context?: RequestContext
): T[] => rows.filter(row => canSeeTrailOf(authorRoleOf(row), context))

/**
 * El autor de algo («creado por»), o `null` si quien mira no lo puede ver.
 * El dato se muestra igual; sólo se calla quién.
 */
const visibleAuthor = <T>(
	author: T,
	authorRole: string | null | undefined,
	context?: RequestContext
): T | null => (canSeeTrailOf(authorRole, context) ? author : null)

export { canSeeTrailOf, visibleAuthor, visibleTrail }
