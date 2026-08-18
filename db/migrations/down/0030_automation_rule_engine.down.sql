DROP TABLE IF EXISTS automation_backups;
DROP TABLE IF EXISTS automation_logs;

ALTER TABLE automation_executions DROP COLUMN IF EXISTS duration_ms;
ALTER TABLE automation_executions DROP COLUMN IF EXISTS exit_code;
ALTER TABLE automation_executions DROP COLUMN IF EXISTS stderr;
ALTER TABLE automation_executions DROP COLUMN IF EXISTS stdout;
ALTER TABLE automation_executions DROP COLUMN IF EXISTS executed_by;
ALTER TABLE automation_executions DROP COLUMN IF EXISTS approved_by;
ALTER TABLE automation_executions DROP COLUMN IF EXISTS dry_run;

ALTER TABLE automation_rules DROP CONSTRAINT IF EXISTS automation_rules_auto_execute_safe_only;
ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_auto_execute_safe_only CHECK (
    NOT auto_execute OR action IN ('RUN_HEALTH_CHECK', 'CREATE_DIAGNOSTIC_SNAPSHOT', 'COLLECT_LOGS')
);

ALTER TABLE automation_rules DROP CONSTRAINT IF EXISTS automation_rules_action_check;
ALTER TABLE automation_rules ADD CONSTRAINT automation_rules_action_check CHECK (action IN (
    'RESTART_SERVICE', 'CLEAR_CACHE', 'RUN_HEALTH_CHECK', 'CREATE_DIAGNOSTIC_SNAPSHOT', 'COLLECT_LOGS'
));

DROP INDEX IF EXISTS idx_automation_rules_project_trigger;
ALTER TABLE automation_rules DROP COLUMN IF EXISTS max_executions_per_hour;
ALTER TABLE automation_rules DROP COLUMN IF EXISTS approval_required;
ALTER TABLE automation_rules DROP COLUMN IF EXISTS cooldown_minutes;
ALTER TABLE automation_rules DROP COLUMN IF EXISTS conditions;
ALTER TABLE automation_rules DROP COLUMN IF EXISTS priority;
ALTER TABLE automation_rules DROP COLUMN IF EXISTS trigger;

ALTER TABLE automation_actions DROP CONSTRAINT IF EXISTS automation_actions_action_check;
ALTER TABLE automation_actions ADD CONSTRAINT automation_actions_action_check CHECK (action IN (
    'RESTART_SERVICE', 'CLEAR_CACHE', 'RUN_HEALTH_CHECK', 'CREATE_DIAGNOSTIC_SNAPSHOT', 'COLLECT_LOGS'
));

DROP INDEX IF EXISTS idx_automation_actions_rule_id_created_at;
ALTER TABLE automation_actions DROP COLUMN IF EXISTS context;
ALTER TABLE automation_actions DROP COLUMN IF EXISTS rule_id;
