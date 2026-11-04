/**
 * Tabla de auditoría. Cada módulo la crea en su base con una migración nueva
 * que corre este SQL. `appRole` es el rol con el que corre el servicio: se le
 * saca UPDATE y DELETE, así la auditoría es append-only de verdad y no por
 * convención.
 */
const auditLogMigration = (appRole?: string): string => {
	if (appRole && !/^[a-z_][a-z0-9_]*$/.test(appRole)) {
		throw new Error(`Rol de Postgres inválido: ${appRole}`)
	}
	return `
CREATE TABLE IF NOT EXISTS audit_log (
	id uuid PRIMARY KEY,
	occurred_at timestamptz NOT NULL DEFAULT now(),
	action text NOT NULL,
	entity_type text NOT NULL,
	entity_id text NOT NULL,
	actor_origin text NOT NULL CHECK (actor_origin IN ('person', 'automatic')),
	actor_id text,
	actor_role text,
	automation_label text,
	local_id text,
	before jsonb,
	after jsonb,
	trace_id text,
	correlation_id text
);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log (entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_trace_idx ON audit_log (trace_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id, occurred_at DESC);
${appRole ? `REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM ${appRole};` : ''}
`
}

/**
 * Columna `view_as` (0.1.3): lo hecho por un superadmin mientras «ve como»
 * otro rol queda a su nombre (`actor_*` es el real) con el rol simulado acá.
 * Va en una migración nueva del servicio; después, `recordViewAs: true` en
 * `PgAuditTrail`.
 */
const auditViewAsMigration = (): string => `
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS view_as jsonb;
`

export { auditLogMigration, auditViewAsMigration }
