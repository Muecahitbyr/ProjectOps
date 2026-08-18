-- Metrik-Katalog deckt genau die im Auftrag genannten Beispiele ab:
--   HEALTH_SCORE < 50            -> metric=HEALTH_SCORE, comparator=LT, threshold=50
--   Incident CRITICAL            -> metric=INCIDENT_SEVERITY, comparator=EQ, severity_threshold=CRITICAL
--   API > 30 Min offline         -> metric=OFFLINE_DURATION, comparator=GT, threshold=30 (Minuten)
--   SSL < 14 Tage                -> metric=SSL_EXPIRY, comparator=LT, threshold=14 (Tage)
--   Response Time > 2s           -> metric=RESPONSE_TIME, comparator=GT, threshold=2000 (ms)
--   > 5 Fehler in 10 Minuten     -> metric=ERROR_COUNT, comparator=GT, threshold=5, window_minutes=10
CREATE TABLE IF NOT EXISTS alert_rules (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    metric TEXT NOT NULL CHECK (metric IN (
        'HEALTH_SCORE', 'INCIDENT_SEVERITY', 'OFFLINE_DURATION',
        'SSL_EXPIRY', 'RESPONSE_TIME', 'ERROR_COUNT'
    )),
    comparator TEXT NOT NULL CHECK (comparator IN ('LT', 'LTE', 'GT', 'GTE', 'EQ')),
    threshold NUMERIC,
    severity_threshold TEXT CHECK (severity_threshold IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    window_minutes INTEGER,
    enabled BOOLEAN NOT NULL DEFAULT true,
    -- Auswertungszustand (analog zu incidents.resolved) - verhindert, dass
    -- eine anhaltend erfuellte Bedingung bei jedem Scheduler-Tick erneut als
    -- "ausgeloest" gemeldet wird.
    currently_triggered BOOLEAN NOT NULL DEFAULT false,
    last_triggered_at TIMESTAMPTZ,
    last_triggered_value TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT alert_rules_threshold_by_metric CHECK (
        (metric = 'INCIDENT_SEVERITY' AND severity_threshold IS NOT NULL)
        OR (metric != 'INCIDENT_SEVERITY' AND threshold IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_project_id ON alert_rules (project_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules (enabled) WHERE enabled = true;
