-- Phase 13 "Enterprise Observability, Distributed Monitoring & Production
-- Operations". Rein additiv: neue Tabellen + eine neue, nullable Spalte auf
-- der bestehenden check_results-Tabelle (agent_id) - keine bestehende
-- Struktur wird geaendert oder entfernt.

-- Teil 1 "Monitoring Agents". Jeder Prozess, der Checks ausfuehrt, meldet
-- sich hier mit echten Host-Daten an (siehe core/local-agent.ts) - status
-- wird NICHT gespeichert, sondern zur Laufzeit aus last_heartbeat_at
-- abgeleitet (vermeidet einen veraltet gespeicherten Status).
CREATE TABLE monitoring_agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    -- Teil 2 "Geografische Monitoring-Standorte": frei konfigurierbar (Env-
    -- Variable AGENT_REGION), NULL = nicht konfiguriert - niemals ein
    -- erfundener Default-Standort.
    region TEXT,
    hostname TEXT NOT NULL,
    agent_version TEXT NOT NULL,
    scheduler_version TEXT NOT NULL,
    capabilities JSONB NOT NULL DEFAULT '[]',
    cpu_info TEXT,
    ram_mb INTEGER,
    disk_total_mb INTEGER,
    os TEXT NOT NULL,
    docker_version TEXT,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE check_results ADD COLUMN agent_id TEXT REFERENCES monitoring_agents(id) ON DELETE SET NULL;
CREATE INDEX idx_check_results_agent_id ON check_results (agent_id, checked_at DESC) WHERE agent_id IS NOT NULL;

-- Teil 10 "Predictive Analytics" / Teil 11 "Diagnostics Center": echte,
-- periodisch gesammelte Ressourcen-Stichproben je Agent - Grundlage fuer
-- Capacity-/Disk-Growth-Forecasts (statistische Regression ueber ECHTE
-- Messwerte, siehe automation/... nein: incidents/forecast.ts). Ohne
-- ausreichend Datenpunkte liefert ein Forecast "insufficient_data" statt
-- eines erfundenen Trends.
CREATE TABLE system_metrics (
    id BIGSERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES monitoring_agents(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cpu_load_percent REAL,
    memory_used_mb INTEGER,
    memory_total_mb INTEGER,
    disk_used_mb INTEGER,
    disk_total_mb INTEGER
);
CREATE INDEX idx_system_metrics_agent_id_recorded_at ON system_metrics (agent_id, recorded_at DESC);

-- Teil 7 "Audit Center" - protokolliert echte, bereits stattfindende
-- Aktionen (Login, Alert-CRUD, Automation-Freigabe, ...) ueber einen
-- zentralen Helper (core/audit-log.ts), der additiv in bestehende Routen
-- eingehaengt wird.
CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'AUTH', 'ALERT', 'AUTOMATION', 'NOTIFICATION', 'INCIDENT',
        'MAINTENANCE', 'BACKUP', 'USER', 'SYSTEM'
    )),
    severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_created_at ON audit_log (created_at DESC);
CREATE INDEX idx_audit_log_user_id ON audit_log (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_log_project_id ON audit_log (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX idx_audit_log_category ON audit_log (category, created_at DESC);

-- Teil 8 "Backup Center" - echter, aus der Datenbank gezogener Snapshot der
-- Konfiguration (Alert-Regeln, Nutzer ohne Zugangsdaten, Benachrichtigungs-
-- einstellungen, Automatisierungsregeln, Wartungsfenster). Kein pg_dump,
-- kein Shell-Aufruf (siehe automation_backups-Praezedenzfall aus Phase 11).
CREATE TABLE system_backups (
    id BIGSERIAL PRIMARY KEY,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    label TEXT NOT NULL,
    data JSONB NOT NULL,
    restored_at TIMESTAMPTZ,
    restored_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_system_backups_created_at ON system_backups (created_at DESC);
