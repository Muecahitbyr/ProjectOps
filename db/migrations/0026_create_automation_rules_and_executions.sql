-- Automation Engine Foundation (Auftragspunkt 5). automation_rules macht
-- die bisher fest codierte Zuordnung Check-Typ -> Aktion (Phase 9,
-- incidents/automation-suggestions.ts) pro Projekt konfigurierbar.
-- auto_execute darf per DB-Constraint NUR fuer die drei sicheren Aktionen
-- gesetzt werden - RESTART_SERVICE/CLEAR_CACHE koennen strukturell nicht
-- automatisch ausgefuehrt werden, unabhaengig von der Anwendungsschicht.
CREATE TABLE IF NOT EXISTS automation_rules (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    -- NULL = gilt fuer alle Check-Typen des Projekts.
    check_type TEXT,
    min_severity TEXT NOT NULL CHECK (min_severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    action TEXT NOT NULL CHECK (action IN (
        'RESTART_SERVICE', 'CLEAR_CACHE', 'RUN_HEALTH_CHECK', 'CREATE_DIAGNOSTIC_SNAPSHOT', 'COLLECT_LOGS'
    )),
    auto_execute BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT automation_rules_auto_execute_safe_only CHECK (
        NOT auto_execute OR action IN ('RUN_HEALTH_CHECK', 'CREATE_DIAGNOSTIC_SNAPSHOT', 'COLLECT_LOGS')
    )
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_project_id ON automation_rules (project_id) WHERE enabled = true;

-- Der tatsaechliche Ausfuehrungs-Lebenszyklus eines Vorschlags
-- (automation_actions bleibt der reine "Vorschlag", siehe Phase 9) - CREATED
-- entspricht dem frisch angelegten Datensatz, APPROVED einer manuellen
-- Freigabe (gefaehrliche Aktionen), RUNNING/SUCCESS/FAILED der tatsaechlichen
-- (nur bei sicheren Aktionen automatischen) Ausfuehrung.
CREATE TABLE IF NOT EXISTS automation_executions (
    id BIGSERIAL PRIMARY KEY,
    automation_action_id BIGINT NOT NULL REFERENCES automation_actions(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'CREATED'
        CHECK (status IN ('CREATED', 'APPROVED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED')),
    result JSONB,
    error TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_executions_action_id ON automation_executions (automation_action_id);
