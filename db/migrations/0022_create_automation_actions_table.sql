-- Self-Healing-Vorbereitung (Auftragspunkt 9): speichert nur VORSCHLAEGE
-- fuer moegliche automatisierte Aktionen, die zu einem echten Incident
-- passen (siehe incidents/automation-suggestions.ts) - status bleibt immer
-- 'PROPOSED', es gibt bewusst (noch) keinen Ausfuehrungspfad im Code.
CREATE TABLE IF NOT EXISTS automation_actions (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    incident_id BIGINT REFERENCES incidents(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('RESTART_SERVICE', 'CLEAR_CACHE', 'RUN_HEALTH_CHECK')),
    trigger TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PROPOSED'
        CHECK (status IN ('PROPOSED', 'APPROVED', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_actions_project_id_created_at
    ON automation_actions (project_id, created_at DESC);
