-- Wartungsfenster (Auftragspunkt 5): waehrend [starts_at, ends_at) fuer ein
-- Projekt unterdrueckt der Scheduler Incident-Eroeffnung/Benachrichtigungen/
-- Alert-Ausloesung (siehe core/monitor.ts, alerts/alert-evaluator.ts) -
-- check_results werden weiterhin normal geschrieben ("Monitoring laeuft
-- weiter, Daten bleiben erhalten").
CREATE TABLE IF NOT EXISTS maintenance_windows (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT maintenance_windows_valid_range CHECK (ends_at > starts_at)
);

-- Haeufigste Abfrage: "ist fuer Projekt X gerade jetzt ein Fenster aktiv?"
CREATE INDEX IF NOT EXISTS idx_maintenance_windows_project_active
    ON maintenance_windows (project_id, starts_at, ends_at);
