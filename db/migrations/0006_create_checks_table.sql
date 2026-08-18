CREATE TABLE IF NOT EXISTS checks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    target TEXT,
    interval_minutes INTEGER NOT NULL DEFAULT 5,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checks_project_id ON checks (project_id);

-- Bestehende check_results referenzieren bereits Check-IDs aus der
-- Konfigurationsdatei. Damit der folgende Foreign-Key-Constraint ohne
-- Datenverlust moeglich ist, werden fehlende checks-Zeilen aus den
-- vorhandenen check_results rekonstruiert. syncProjects() ueberschreibt diese
-- Platzhalter beim naechsten Start mit den echten Werten (target,
-- interval_minutes, enabled) aus projects.config.ts.
INSERT INTO checks (id, project_id, type)
SELECT DISTINCT check_id, project_id, check_type
FROM check_results
ON CONFLICT (id) DO NOTHING;

ALTER TABLE check_results
    ADD CONSTRAINT check_results_check_id_fkey
    FOREIGN KEY (check_id) REFERENCES checks(id) ON DELETE CASCADE;
