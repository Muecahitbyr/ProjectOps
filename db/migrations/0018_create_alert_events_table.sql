-- Deduplizierte Alert-Historie (Auftragspunkt 4 "Alert Deduplication"):
-- eine anhaltend erfuellte Regel erzeugt genau EINE Zeile (started_at bis
-- resolved_at) statt bei jedem Scheduler-Tick einen neuen Datensatz.
-- occurrences zaehlt, wie oft die Bedingung waehrend dieser Episode erneut
-- als erfuellt ausgewertet wurde; last_seen_at wird bei jeder erneuten
-- Bestaetigung aktualisiert. alert_rules.currently_triggered/
-- last_triggered_at/last_triggered_value (Phase 7) bleiben unveraendert der
-- "aktuelle Zustand" der Regel - alert_events ist die zusaetzliche,
-- vollstaendige Historie fuer /alerts/history.
CREATE TABLE IF NOT EXISTS alert_events (
    id BIGSERIAL PRIMARY KEY,
    alert_rule_id BIGINT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- Kopie der Regel-Severity zum Ausloese-Zeitpunkt - bleibt stabil, auch
    -- wenn die Regel spaeter bearbeitet wird (echte Historie, kein Verweis
    -- auf einen sich aendernden aktuellen Zustand).
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'HIGH', 'CRITICAL')),
    status TEXT NOT NULL DEFAULT 'TRIGGERED'
        CHECK (status IN ('TRIGGERED', 'RESOLVED', 'SUPPRESSED')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    occurrences INTEGER NOT NULL DEFAULT 1,
    last_value TEXT,
    -- Grund, falls status = SUPPRESSED (aktuell nur 'MAINTENANCE').
    suppressed_reason TEXT,
    -- Wie viele Eskalationsstufen (alert_escalation_steps) fuer diese
    -- Episode bereits ausgeloest wurden - verhindert doppelte Eskalationen
    -- bei wiederholten Scheduler-Ticks.
    last_escalated_step INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pro Regel darf zu jedem Zeitpunkt hoechstens eine offene (TRIGGERED oder
-- SUPPRESSED) Episode existieren - das IST die Deduplizierung.
CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_events_open_per_rule
    ON alert_events (alert_rule_id) WHERE status IN ('TRIGGERED', 'SUPPRESSED');

CREATE INDEX IF NOT EXISTS idx_alert_events_project_id_started_at
    ON alert_events (project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert_rule_id_started_at
    ON alert_events (alert_rule_id, started_at DESC);
