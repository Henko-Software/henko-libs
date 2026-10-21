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

export { auditLogMigration }
