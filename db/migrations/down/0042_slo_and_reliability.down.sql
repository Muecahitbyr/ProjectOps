DROP INDEX IF EXISTS idx_alert_rules_slo_id;
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_slo_id_by_metric;
ALTER TABLE alert_rules DROP CONSTRAINT IF EXISTS alert_rules_metric_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_metric_check CHECK (metric IN (
    'HEALTH_SCORE', 'INCIDENT_SEVERITY', 'OFFLINE_DURATION',
    'SSL_EXPIRY', 'RESPONSE_TIME', 'ERROR_COUNT',
    'MULTIPLE_CHECKS_OFFLINE', 'INCIDENT_SPIKE'
));
ALTER TABLE alert_rules DROP COLUMN IF EXISTS slo_id;

DROP TABLE IF EXISTS slo_evaluations;
DROP TABLE IF EXISTS slos;
