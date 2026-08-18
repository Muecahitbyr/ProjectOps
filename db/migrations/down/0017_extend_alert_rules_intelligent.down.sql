ALTER TABLE alert_rules DROP CONSTRAINT alert_rules_condition_by_type;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_threshold_by_metric CHECK (
    (metric = 'INCIDENT_SEVERITY' AND severity_threshold IS NOT NULL)
    OR (metric != 'INCIDENT_SEVERITY' AND threshold IS NOT NULL)
);
ALTER TABLE alert_rules DROP CONSTRAINT alert_rules_metric_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_metric_check CHECK (metric IN (
    'HEALTH_SCORE', 'INCIDENT_SEVERITY', 'OFFLINE_DURATION',
    'SSL_EXPIRY', 'RESPONSE_TIME', 'ERROR_COUNT'
));
ALTER TABLE alert_rules
    DROP COLUMN rule_type,
    DROP COLUMN severity,
    DROP COLUMN condition;
