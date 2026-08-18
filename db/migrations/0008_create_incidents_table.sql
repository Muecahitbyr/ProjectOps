CREATE TABLE IF NOT EXISTS incidents (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    check_id TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
    severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    title TEXT NOT NULL,
    description TEXT,
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

-- Nur ein offener Incident pro Check gleichzeitig (verhindert Duplikate,
-- solange ein Problem bereits erfasst ist).
CREATE UNIQUE INDEX IF NOT EXISTS idx_incidents_open_per_check
    ON incidents (check_id) WHERE resolved = false;

CREATE INDEX IF NOT EXISTS idx_incidents_project_id_created_at
    ON incidents (project_id, created_at DESC);
