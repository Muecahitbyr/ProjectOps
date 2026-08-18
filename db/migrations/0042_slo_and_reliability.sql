-- Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service Health".
-- Fuegt eine konfigurierbare SLO-Ebene UEBER die bestehende Monitoring-/
-- Analytics-Basis hinzu (check_results, checks, incidents, api_key_usage
-- bleiben die einzige Rohdatenquelle - siehe core/sli-calculator.ts und die
-- Erweiterungen in db/analytics.repository.ts). Keine Rohdaten werden
-- dupliziert; slo_evaluations speichert ausschliesslich periodische,
-- bereits aggregierte Snapshots (SLI-Wert/Error-Budget/Burn-Rate/Status je
-- SLO), die fuer Trend-Charts (Auftragspunkt 11/14) sonst bei jedem
-- Seitenaufruf aus Rohdaten neu berechnet werden muessten.
CREATE TABLE slos (
    id BIGSERIAL PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    -- Team optional (organisationsweite SLOs sind erlaubt), Projekt optional
    -- (z.B. eine reine API-Availability-SLO ist organisationsweit ueber
    -- api_key_usage berechnet, kein einzelnes Projekt betroffen), Check
    -- optional (nur sinnvoll, wenn auch ein Projekt gesetzt ist - siehe
    -- CHECK unten).
    team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    check_id TEXT REFERENCES checks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    sli_type TEXT NOT NULL CHECK (sli_type IN (
        'AVAILABILITY', 'ERROR_RATE', 'LATENCY', 'API_AVAILABILITY', 'API_ERROR_RATE'
    )),
    -- Zielwert in Prozent (z.B. 99.9 fuer Availability, 1 fuer Error Rate
    -- als Obergrenze "< 1%", 99 fuer "99% unter Latenzziel").
    target NUMERIC NOT NULL CHECK (target > 0 AND target <= 100),
    -- Nur fuer sli_type=LATENCY: das Latenzziel selbst (z.B. 500ms), gegen
    -- das der Anteil "innerhalb des Ziels" (=target%) gemessen wird.
    latency_threshold_ms INTEGER,
    -- Rollierendes Auswertungsfenster fuer Error-Budget/SLA (Tage) - Default
    -- 30 entspricht dem ueblichen monatlichen SLA-Zeitraum (Auftragspunkt 10).
    window_days INTEGER NOT NULL DEFAULT 30 CHECK (window_days > 0),
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Ein Check-scope setzt zwingend auch project_id (checks gehoeren immer
    -- zu einem Projekt) - verhindert eine SLO mit check_id aber ohne
    -- project_id, die bei der Tenant-/Scope-Aufloesung nicht eindeutig waere.
    CONSTRAINT slos_check_requires_project CHECK (check_id IS NULL OR project_id IS NOT NULL),
    -- API_AVAILABILITY/API_ERROR_RATE sind organisationsweite Kennzahlen aus
    -- api_key_usage (kein einzelner Check) - project_id/check_id ergeben
    -- fachlich keinen Sinn und wuerden bei der Auswertung ignoriert werden;
    -- stattdessen von vornherein verbieten, um keine irrefuehrende
    -- Konfiguration zuzulassen.
    CONSTRAINT slos_api_sli_no_check_scope CHECK (
        sli_type NOT IN ('API_AVAILABILITY', 'API_ERROR_RATE') OR check_id IS NULL
    ),
    CONSTRAINT slos_latency_requires_threshold CHECK (
        sli_type != 'LATENCY' OR latency_threshold_ms IS NOT NULL
    )
);

CREATE INDEX idx_slos_organization_id ON slos (organization_id);
CREATE INDEX idx_slos_team_id ON slos (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_slos_project_id ON slos (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_slos_enabled ON slos (enabled) WHERE enabled = true;

-- Periodische, bereits aggregierte Snapshots (core/slo-evaluator.ts, alle
-- ~2 Minuten gedrosselt, siehe dort) - kein abgeleitetes "status"-Feld auf
-- slos selbst (Auftragspunkt 5 "keine redundanten Statusfelder, wenn Status
-- ableitbar ist"): der aktuelle Status ist immer der juengste Eintrag hier.
CREATE TABLE slo_evaluations (
    id BIGSERIAL PRIMARY KEY,
    slo_id BIGINT NOT NULL REFERENCES slos(id) ON DELETE CASCADE,
    sli_value NUMERIC NOT NULL,
    -- Snapshot des zum Zeitpunkt der Auswertung gueltigen Zielwerts - eine
    -- spaetere Aenderung von slos.target darf historische Auswertungen nicht
    -- rueckwirkend verfaelschen.
    target NUMERIC NOT NULL,
    error_budget_remaining_percent NUMERIC NOT NULL,
    burn_rate NUMERIC NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('HEALTHY', 'DEGRADED', 'CRITICAL')),
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_slo_evaluations_slo_id_evaluated_at ON slo_evaluations (slo_id, evaluated_at DESC);

-- Auftragspunkt 9 "SLO Alerting" - optionale, minimale Integration in die
-- BESTEHENDE Alert-Engine (keine zweite Evaluations-Engine): eine
-- THRESHOLD-Regel mit metric=SLO_BREACH/SLO_BURN_RATE referenziert genau
-- eine SLO; alert-evaluator.ts wertet sie im selben evaluateProjectAlertRules()
-- -Tick aus wie jede andere Metrik. Nullable, da die grundlegende Breach-
-- Erkennung (Realtime+Audit, Auftragspunkt 8) bereits unabhaengig davon im
-- Hintergrund-Evaluator laeuft (siehe Abschlussbericht "Architekturentscheidungen") -
-- eine Alert-Regel ist ein ZUSAETZLICHES, optionales Werkzeug fuer volle
-- Eskalations-/Benachrichtigungs-Policy-Kontrolle auf Projekt-Ebene.
ALTER TABLE alert_rules ADD COLUMN slo_id BIGINT REFERENCES slos(id) ON DELETE CASCADE;

ALTER TABLE alert_rules DROP CONSTRAINT alert_rules_metric_check;
ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_metric_check CHECK (metric IN (
    'HEALTH_SCORE', 'INCIDENT_SEVERITY', 'OFFLINE_DURATION',
    'SSL_EXPIRY', 'RESPONSE_TIME', 'ERROR_COUNT',
    'MULTIPLE_CHECKS_OFFLINE', 'INCIDENT_SPIKE',
    'SLO_BREACH', 'SLO_BURN_RATE'
));

ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_slo_id_by_metric CHECK (
    (metric IN ('SLO_BREACH', 'SLO_BURN_RATE') AND slo_id IS NOT NULL)
    OR (metric NOT IN ('SLO_BREACH', 'SLO_BURN_RATE') AND slo_id IS NULL)
);

CREATE INDEX idx_alert_rules_slo_id ON alert_rules (slo_id) WHERE slo_id IS NOT NULL;
