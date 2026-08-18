CREATE TABLE IF NOT EXISTS check_results (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    check_id TEXT NOT NULL,
    check_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE', 'ERROR')),
    status_code INTEGER,
    response_time_ms INTEGER,
    error TEXT,
    checked_at TIMESTAMPTZ NOT NULL
);

-- Letztes Ergebnis / Verlauf je Check (results.routes.ts)
CREATE INDEX IF NOT EXISTS idx_check_results_check_id_checked_at
    ON check_results (check_id, checked_at DESC);

-- Statistiken je Projekt (Uptime, Fehleranzahl, ...)
CREATE INDEX IF NOT EXISTS idx_check_results_project_id_checked_at
    ON check_results (project_id, checked_at DESC);

-- Letzte Ausfaelle je Check (status != ONLINE)
CREATE INDEX IF NOT EXISTS idx_check_results_check_id_status_checked_at
    ON check_results (check_id, status, checked_at DESC);
