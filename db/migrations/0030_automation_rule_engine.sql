-- Phase 11 "Enterprise Automation & Self-Healing", Teil 1+2+6: aktiviert
-- automation_rules (bisher nur CRUD, nie vom Scheduler ausgewertet) und
-- ergaenzt die dafuer noetigen Spalten, sieben neue sichere Self-Healing-
-- Aktionen sowie ein Ausfuehrungs-Log. Nichts Bestehendes wird entfernt -
-- alle neuen Spalten haben Defaults, damit vorhandene Zeilen gueltig bleiben.

-- automation_actions: welche Regel hat diese Aktion ausgeloest (NULL bei
-- AI-Vorschlaegen aus incidents/automation-suggestions.ts, Phase 9, die
-- weiterhin ohne Regel funktionieren) + strukturierter Ausloese-Kontext
-- (z.B. { "checkId": "..." } fuer RETRY_CHECK, das wissen muss WELCHER
-- Check erneut geprueft werden soll).
ALTER TABLE automation_actions ADD COLUMN rule_id BIGINT REFERENCES automation_rules(id) ON DELETE SET NULL;
ALTER TABLE automation_actions ADD COLUMN context JSONB;
CREATE INDEX idx_automation_actions_rule_id_created_at
    ON automation_actions (rule_id, created_at DESC) WHERE rule_id IS NOT NULL;

-- Sieben neue Aktionstypen (Teil 2). RESTART_SERVICE bleibt ohne
-- Ausfuehrungspfad (Phase 9/10-Entscheidung, siehe automation/safe-action-runner.ts).
ALTER TABLE automation_actions DROP CONSTRAINT automation_actions_action_check;
ALTER TABLE automation_actions ADD CONSTRAINT automation_actions_action_check CHECK (action IN (
    'RESTART_SERVICE', 'CLEAR_CACHE', 'RUN_HEALTH_CHECK', 'CREATE_DIAGNOSTIC_SNAPSHOT', 'COLLECT_LOGS',
    'RESTART_CONTAINER', 'RESTART_MONITOR', 'RETRY_CHECK', 'RELOAD_CONFIGURATION',
    'FLUSH_QUEUE', 'CREATE_BACKUP', 'VERIFY_DEPENDENCIES'
));

-- automation_rules: Ausloeser, Prioritaet, flexible Zusatzbedingungen,
-- Cooldown und Rate-Limit sowie ob eine Freigabe noetig ist, bevor eine
-- passende, sichere Aktion tatsaechlich laeuft.
ALTER TABLE automation_rules ADD COLUMN trigger TEXT NOT NULL DEFAULT 'INCIDENT_CREATED' CHECK (trigger IN (
    'INCIDENT_CREATED', 'INCIDENT_RESOLVED', 'ALERT_TRIGGERED', 'ALERT_ESCALATED',
    'PROJECT_CRITICAL', 'PROJECT_WARNING', 'CHECK_FAILED', 'CHECK_RECOVERED',
    'MAINTENANCE_STARTED', 'MAINTENANCE_ENDED', 'ROOT_INCIDENT_CREATED'
));
ALTER TABLE automation_rules ADD COLUMN priority INTEGER NOT NULL DEFAULT 100;
ALTER TABLE automation_rules ADD COLUMN conditions JSONB;
ALTER TABLE automation_rules ADD COLUMN cooldown_minutes INTEGER NOT NULL DEFAULT 15 CHECK (cooldown_minutes >= 0);
ALTER TABLE automation_rules ADD COLUMN approval_required BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE automation_rules ADD COLUMN max_executions_per_hour INTEGER NOT NULL DEFAULT 10 CHECK (max_executions_per_hour > 0);
CREATE INDEX idx_automation_rules_project_trigger ON automation_rules (project_id, trigger) WHERE enabled = true;

ALTER TABLE automation_rules DROP CONSTRAINT automation_rules_action_check;
ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_action_check CHECK (action IN (
    'RESTART_SERVICE', 'CLEAR_CACHE', 'RUN_HEALTH_CHECK', 'CREATE_DIAGNOSTIC_SNAPSHOT', 'COLLECT_LOGS',
    'RESTART_CONTAINER', 'RESTART_MONITOR', 'RETRY_CHECK', 'RELOAD_CONFIGURATION',
    'FLUSH_QUEUE', 'CREATE_BACKUP', 'VERIFY_DEPENDENCIES'
));

-- auto_execute darf strukturell nur fuer Aktionen gesetzt werden, die ohne
-- Freigabe unbedenklich sind - RESTART_SERVICE (kein Ausfuehrungspfad) und
-- RESTART_CONTAINER (echter Container-Neustart, siehe safe-action-runner.ts)
-- bleiben bewusst aussen vor, egal was approval_required sagt.
ALTER TABLE automation_rules DROP CONSTRAINT automation_rules_auto_execute_safe_only;
ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_auto_execute_safe_only CHECK (
    NOT auto_execute OR action IN (
        'RUN_HEALTH_CHECK', 'CREATE_DIAGNOSTIC_SNAPSHOT', 'COLLECT_LOGS', 'CLEAR_CACHE',
        'RESTART_MONITOR', 'RETRY_CHECK', 'RELOAD_CONFIGURATION', 'FLUSH_QUEUE',
        'CREATE_BACKUP', 'VERIFY_DEPENDENCIES'
    )
);

-- automation_executions: Freigabe-/Ausfuehrungs-Zuordnung (wer hat
-- freigegeben, wer/was hat ausgefuehrt - NULL bei executed_by = automatisch
-- durch den Scheduler), Dry-Run-Kennzeichnung und die in Teil 2 geforderten
-- Ausfuehrungsdetails.
ALTER TABLE automation_executions ADD COLUMN dry_run BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE automation_executions ADD COLUMN approved_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE automation_executions ADD COLUMN executed_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE automation_executions ADD COLUMN stdout TEXT;
ALTER TABLE automation_executions ADD COLUMN stderr TEXT;
ALTER TABLE automation_executions ADD COLUMN exit_code INTEGER;
ALTER TABLE automation_executions ADD COLUMN duration_ms INTEGER;

-- Teil 6 "Execution Logs" - strukturierte, per Ausfuehrung zugeordnete
-- Log-Zeilen (zusaetzlich zum grob zusammengefassten result/stdout/stderr
-- oben), live per WebSocket gestreamt (siehe realtime/events.ts EXECUTION_LOG).
CREATE TABLE automation_logs (
    id BIGSERIAL PRIMARY KEY,
    execution_id BIGINT NOT NULL REFERENCES automation_executions(id) ON DELETE CASCADE,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
    level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')),
    message TEXT NOT NULL,
    source TEXT NOT NULL
);
CREATE INDEX idx_automation_logs_execution_id ON automation_logs (execution_id, "timestamp");

-- Fuer die CREATE_BACKUP-Aktion (Teil 2): echter, aus der Datenbank
-- gezogener Snapshot der projektbezogenen Automatisierungs-/Monitoring-
-- Konfiguration (kein pg_dump-Aufruf - siehe Kommentar in safe-action-runner.ts).
CREATE TABLE automation_backups (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    automation_execution_id BIGINT REFERENCES automation_executions(id) ON DELETE SET NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_automation_backups_project_id ON automation_backups (project_id, created_at DESC);
