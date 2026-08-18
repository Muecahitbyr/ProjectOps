DROP TABLE IF EXISTS rolling_updates;
DROP TABLE IF EXISTS cluster_events;
DROP TABLE IF EXISTS agent_logs;
DROP TABLE IF EXISTS agent_assignments;
DROP TABLE IF EXISTS cluster_nodes;

ALTER TABLE monitoring_agents
    DROP COLUMN IF EXISTS tags,
    DROP COLUMN IF EXISTS tls_fingerprint,
    DROP COLUMN IF EXISTS node_version,
    DROP COLUMN IF EXISTS agent_secret_hash,
    DROP COLUMN IF EXISTS agent_secret_rotated_at,
    DROP COLUMN IF EXISTS last_heartbeat_sequence,
    DROP COLUMN IF EXISTS status;
