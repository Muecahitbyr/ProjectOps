DROP TABLE IF EXISTS system_backups;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS system_metrics;

DROP INDEX IF EXISTS idx_check_results_agent_id;
ALTER TABLE check_results DROP COLUMN IF EXISTS agent_id;

DROP TABLE IF EXISTS monitoring_agents;
