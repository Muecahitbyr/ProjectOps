-- Phase 21 "Enterprise Alerting, Incident Response & Notification
-- Orchestration" Auftragspunkt 3/4 "Incident Lifecycle"/"Incident Timeline".
-- incidents (Migration 0008) hat bereits resolved/resolved_at - additiv um
-- ACKNOWLEDGED-Zustand/Assignee/Resolution-Grund erweitert. Bewusst KEIN
-- redundantes "status"-Feld: OPEN/ACKNOWLEDGED/RESOLVED lassen sich
-- vollstaendig aus acknowledged_at/resolved_at ableiten (siehe
-- deriveIncidentStatus() in types/incident.types.ts), exakt dasselbe
-- Prinzip wie deriveApiKeyStatus() aus Phase 20.
ALTER TABLE incidents ADD COLUMN acknowledged_at TIMESTAMPTZ;
ALTER TABLE incidents ADD COLUMN acknowledged_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN resolution_reason TEXT;

-- Auftragspunkt 19 "Performance" - "Indexes pruefen fuer: severity,
-- created_at, resolved_at" (organization_id/team_id existieren auf
-- incidents nicht direkt, siehe Aufloesung ueber projects, bestehendes
-- Muster seit Phase 16). idx_incidents_project_id_created_at (0008) deckt
-- projektbezogene Abfragen bereits ab - die beiden folgenden Indizes
-- ergaenzen die uebrigen, organisationsweiten Dashboard-Abfragen (Open/
-- Critical/Acknowledged/Resolved-Today-Kennzahlen ueber alle Projekte
-- hinweg), die bisher nur ueber project_id gefiltert werden konnten.
CREATE INDEX idx_incidents_severity_created_at ON incidents (severity, created_at DESC);
CREATE INDEX idx_incidents_resolved_at ON incidents (resolved_at) WHERE resolved_at IS NOT NULL;
CREATE INDEX idx_incidents_acknowledged_at ON incidents (acknowledged_at) WHERE acknowledged_at IS NOT NULL;

-- Auftragspunkt 4 "Incident Timeline" - EIGENE, schlanke Tabelle statt
-- audit_log zweckzuentfremden: audit_log ist der plattformweite
-- Compliance-/Sicherheits-Trail (siehe core/audit-log.ts) und kennt keine
-- incident_id-Spalte; ein Kommentar-Eintrag ("COMMENTED") ist zudem kein
-- Sicherheitsereignis und gehoert fachlich nicht dorthin. incident_timeline_
-- events ist stattdessen die MENSCHENLESBARE Erzaehlung EINES Incidents
-- (inkl. Benachrichtigungs-/Automatisierungsdetails, die audit_log nie in
-- dieser Granularitaet fuehrt) - keine doppelte Datenhaltung: sicherheits-
-- relevante Aktionen (ACKNOWLEDGED/RESOLVED/REOPENED/AUTOMATION_TRIGGERED)
-- werden WEITERHIN zusaetzlich ins bestehende audit_log geschrieben (siehe
-- routes/incidents.routes.ts), dort aber ohne Timeline-spezifische
-- Formatierung/Reihenfolge pro Incident.
CREATE TABLE incident_timeline_events (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'CREATED', 'ALERT_TRIGGERED', 'NOTIFICATION_SENT', 'ACKNOWLEDGED',
        'AUTOMATION_STARTED', 'AUTOMATION_SUCCEEDED', 'AUTOMATION_FAILED',
        'RESOLVED', 'REOPENED', 'COMMENTED', 'ASSIGNED'
    )),
    message TEXT NOT NULL,
    metadata JSONB,
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incident_timeline_events_incident_id ON incident_timeline_events (incident_id, created_at ASC);
