DROP INDEX IF EXISTS idx_automation_actions_rule_incident_active;
DROP INDEX IF EXISTS idx_automation_executions_one_active_per_action;
ALTER TABLE automation_rules DROP COLUMN IF EXISTS max_attempts_per_incident;
ALTER TABLE automation_rules DROP COLUMN IF EXISTS timeout_seconds;
ALTER TABLE automation_rules DROP CONSTRAINT IF EXISTS automation_rules_critical_requires_approval;
ALTER TABLE automation_rules DROP COLUMN IF EXISTS risk_level;
