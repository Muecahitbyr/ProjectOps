-- Incident-Korrelation (Auftragspunkt 7): regelbasierte Gruppierung mehrerer
-- gleichzeitiger Incidents ueber Projekte hinweg mit derselben Fehlerquelle
-- (gleicher checks.type) zu einem "Root Incident". Keine echte KI - eine
-- deterministische, nachvollziehbare Regel (siehe correlateIncidents() in
-- alerts/incident-correlation.ts): >= 2 verschiedene Projekte, gleicher
-- Check-Typ, Incident-Start innerhalb eines kurzen Zeitfensters.
CREATE TABLE IF NOT EXISTS root_incidents (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    cause_check_type TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ein Incident gehoert zu hoechstens einem Root Incident.
ALTER TABLE incidents ADD COLUMN root_incident_id BIGINT REFERENCES root_incidents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_root_incident_id ON incidents (root_incident_id);
