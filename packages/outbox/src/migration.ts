/**
 * Tabla del outbox. Cada módulo la crea en su base con una migración nueva
 * que corre este SQL.
 */
const outboxMigration = (): string => `
CREATE TABLE IF NOT EXISTS outbox (
	id uuid PRIMARY KEY,
	type text NOT NULL,
	aggregate_type text NOT NULL,
	aggregate_id text NOT NULL,
	payload jsonb NOT NULL,
	headers jsonb NOT NULL DEFAULT '{}'::jsonb,
	occurred_at timestamptz NOT NULL DEFAULT now(),
	published_at timestamptz,
	attempts integer NOT NULL DEFAULT 0,
	last_error text
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox (occurred_at) WHERE published_at IS NULL;
`

export { outboxMigration }
