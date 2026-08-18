-- Phase 14 "Enterprise Multi-Node Cluster, Remote Agents & High Availability".
-- Rein additiv: erweitert monitoring_agents (Phase 13) um Felder fuer echte
-- Remote-Agent-Authentifizierung/-Verwaltung, keine bestehende Spalte wird
-- veraendert oder entfernt. Neue Tabellen fuer Cluster-Knoten (HA),
-- Check-Zuweisung (verteilter Scheduler), Agent-Logs, Cluster-Ereignis-
-- Historie (Failover/Registrierung/...) und Rolling-Update-Statusverwaltung.

ALTER TABLE monitoring_agents
    ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN tls_fingerprint TEXT,
    ADD COLUMN node_version TEXT,
    -- SHA-256-Hash des Agent Secrets (analog zu auth_sessions.token_hash,
    -- siehe auth/tokens.ts hashRefreshToken) - ein Agent Secret ist wie ein
    -- Refresh-Token bereits ein zufaelliger, hochentropischer Wert (kein von
    -- Menschen gewaehltes Passwort), SHA-256 statt bcrypt ist daher
    -- ausreichend und deckt sich mit dem bestehenden Muster.
    ADD COLUMN agent_secret_hash TEXT,
    ADD COLUMN agent_secret_rotated_at TIMESTAMPTZ,
    -- Replay Protection (Auftragspunkt 2): jeder Heartbeat muss eine
    -- strikt steigende Sequenznummer mitsenden - ein wiederholter (replay)
    -- Request mit einer bereits gesehenen/kleineren Sequenz wird abgelehnt.
    ADD COLUMN last_heartbeat_sequence BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'REVOKED'));

-- Cluster-Knoten = ProjectOps-Backend-Instanzen selbst (Auftragspunkt 11
-- "High Availability") - bewusst eine eigene Tabelle statt monitoring_agents
-- wiederzuverwenden: ein Cluster-Knoten fuehrt den Scheduler/die API aus,
-- ein Monitoring-Agent (Phase 13) fuehrt nur Checks aus. Beide Konzepte
-- koennen (muessen aber nicht) auf demselben Prozess laufen.
CREATE TABLE cluster_nodes (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('PRIMARY', 'SECONDARY')),
    hostname TEXT NOT NULL,
    backend_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'HEALTHY' CHECK (status IN ('HEALTHY', 'DEGRADED', 'UNREACHABLE')),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aktuelle Zuweisung Check -> Agent (verteilter Scheduler, Auftragspunkt 4).
-- Nur der AKTUELLE Zustand (ein Agent pro Check) - der Verlauf von
-- Umverteilungen steht in cluster_events (CHECK_REASSIGNED), analog zur
-- Trennung monitoring_agents (aktueller Zustand) / audit_log (Verlauf).
CREATE TABLE agent_assignments (
    check_id TEXT PRIMARY KEY REFERENCES checks(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES monitoring_agents(id) ON DELETE CASCADE,
    strategy TEXT NOT NULL CHECK (strategy IN ('ROUND_ROBIN', 'WEIGHTED', 'LEAST_LOADED', 'REGION_PREFERRED', 'HEALTH_PREFERRED')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_assignments_agent_id ON agent_assignments (agent_id);

-- Strukturierte Agent-Logs (Auftragspunkt 8) - getrennt von audit_log
-- (Benutzeraktionen) und dem bestehenden Winston-Logger (Prozess-Log ohne
-- DB-Persistenz): dies sind vom jeweiligen Agenten gemeldete, nach
-- Projekt/Check filterbare Betriebsereignisse.
CREATE TABLE agent_logs (
    id BIGSERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES monitoring_agents(id) ON DELETE CASCADE,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    check_id TEXT REFERENCES checks(id) ON DELETE SET NULL,
    level TEXT NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')),
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_logs_agent_id_created_at ON agent_logs (agent_id, created_at DESC);
CREATE INDEX idx_agent_logs_project_id ON agent_logs (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX idx_agent_logs_level ON agent_logs (level, created_at DESC);

-- Persistierte Cluster-Ereignis-Historie (Auftragspunkt 5/6: "Failover
-- Historie") - Realtime-Events (websocket.server.ts) sind fluechtig und
-- erreichen nur gerade verbundene Clients; diese Tabelle ist die dauerhafte
-- Quelle fuer Dashboard/Analytics-Verlaufsansichten.
CREATE TABLE cluster_events (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'AGENT_REGISTERED', 'AGENT_UPDATED', 'AGENT_REMOVED', 'AGENT_PAUSED', 'AGENT_RESUMED',
        'CHECK_REASSIGNED', 'FAILOVER_STARTED', 'FAILOVER_FINISHED',
        'CLUSTER_UPDATED', 'ROLLING_UPDATE_STARTED', 'ROLLING_UPDATE_FINISHED'
    )),
    agent_id TEXT REFERENCES monitoring_agents(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cluster_events_created_at ON cluster_events (created_at DESC);
CREATE INDEX idx_cluster_events_event_type ON cluster_events (event_type, created_at DESC);
CREATE INDEX idx_cluster_events_agent_id ON cluster_events (agent_id, created_at DESC) WHERE agent_id IS NOT NULL;

-- Rolling-Update-Statusverwaltung (Auftragspunkt 9) - bewusst NUR
-- Architektur/Statusuebergaenge, kein echter Software-Download (siehe
-- Auftrag: "Keine echten Softwaredownloads").
CREATE TABLE rolling_updates (
    id BIGSERIAL PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES monitoring_agents(id) ON DELETE CASCADE,
    target_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'DOWNLOADING', 'INSTALLING', 'RESTARTING', 'HEALTHY', 'FAILED', 'ROLLED_BACK'
    )),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error TEXT,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rolling_updates_agent_id_created_at ON rolling_updates (agent_id, created_at DESC);
