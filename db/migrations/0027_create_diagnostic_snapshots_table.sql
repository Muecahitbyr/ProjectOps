-- Diagnostic Snapshots (Auftragspunkt 6): bei Incident-Eroeffnung ein
-- vollstaendiges Abbild des Projektzustands, damit spaeter (auch nach
-- Behebung) nachvollziehbar bleibt, wie der Zustand zum Zeitpunkt des
-- Ausfalls war. snapshot.activeDeployments ist bewusst immer ein leeres
-- Array - ProjectOps hat kein Deployment-Tracking-System (siehe
-- src/incidents/diagnostic-snapshot.ts), das Feld ist real typisiert,
-- aber ohne Datenquelle nicht erfunden befuellt.
CREATE TABLE IF NOT EXISTS diagnostic_snapshots (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    incident_id BIGINT REFERENCES incidents(id) ON DELETE SET NULL,
    health_score INTEGER NOT NULL,
    snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_snapshots_project_id ON diagnostic_snapshots (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_snapshots_incident_id ON diagnostic_snapshots (incident_id);
