-- Phase 9: "Intelligent Alert Engine". Erweitert alert_rules um Regeltypen
-- (bisher implizit immer "Schwellenwert") und eine eigene Severity fuer die
-- Regel selbst (fuer Eskalation/Benachrichtigung) - unabhaengig von
-- severity_threshold, das ausschliesslich als Vergleichswert fuer die
-- Metrik INCIDENT_SEVERITY dient. condition speichert die zusaetzlichen,
-- typspezifischen Parameter fuer TREND/ANOMALY/COMPOSITE-Regeln als JSONB,
-- ohne die bestehenden Threshold-Spalten zu veraendern - bestehende Regeln
-- (rule_type-Default 'THRESHOLD') bleiben unveraendert lauffaehig.
ALTER TABLE alert_rules
    ADD COLUMN rule_type TEXT NOT NULL DEFAULT 'THRESHOLD'
        CHECK (rule_type IN ('THRESHOLD', 'TREND', 'ANOMALY', 'COMPOSITE')),
    ADD COLUMN severity TEXT NOT NULL DEFAULT 'WARNING'
        CHECK (severity IN ('INFO', 'WARNING', 'HIGH', 'CRITICAL')),
    ADD COLUMN condition JSONB;

-- Zwei zusaetzliche Pseudo-Metriken ausschliesslich fuer COMPOSITE-Regeln
-- ("Mehrere Checks gleichzeitig offline" / "Incident-Spike erkannt") - die
-- eigentlichen Parameter (Schwellenwerte, Zeitfenster) stehen in "condition",
-- der Metrik-Wert dient hier nur der Einordnung/Anzeige.
ALTER TABLE alert_rules DROP CONSTRAINT alert_rules_metric_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_metric_check CHECK (metric IN (
    'HEALTH_SCORE', 'INCIDENT_SEVERITY', 'OFFLINE_DURATION',
    'SSL_EXPIRY', 'RESPONSE_TIME', 'ERROR_COUNT',
    'MULTIPLE_CHECKS_OFFLINE', 'INCIDENT_SPIKE'
));

-- metric/threshold sind fuer THRESHOLD-Regeln weiterhin per bestehender
-- Logik verpflichtend; TREND/ANOMALY/COMPOSITE-Regeln nutzen stattdessen
-- "condition" und duerfen threshold NULL lassen. Der bestehende CHECK wird
-- daher ersetzt, statt eine zweite, widerspruechliche Bedingung danebenzustellen.
ALTER TABLE alert_rules DROP CONSTRAINT alert_rules_threshold_by_metric;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_condition_by_type CHECK (
    (rule_type = 'THRESHOLD' AND (
        (metric = 'INCIDENT_SEVERITY' AND severity_threshold IS NOT NULL)
        OR (metric != 'INCIDENT_SEVERITY' AND threshold IS NOT NULL)
    ))
    OR (rule_type IN ('TREND', 'ANOMALY', 'COMPOSITE') AND condition IS NOT NULL)
);
