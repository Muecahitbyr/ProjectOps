ALTER TABLE audit_log DROP CONSTRAINT audit_log_category_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check CHECK (category IN (
    'AUTH', 'ALERT', 'AUTOMATION', 'NOTIFICATION', 'INCIDENT',
    'MAINTENANCE', 'BACKUP', 'USER', 'SYSTEM', 'SLO', 'SERVICE'
));

DROP INDEX IF EXISTS idx_alert_escalation_steps_on_call_schedule_id;
ALTER TABLE alert_escalation_steps DROP COLUMN IF EXISTS on_call_schedule_id;

DROP TABLE IF EXISTS on_call_overrides;
DROP TABLE IF EXISTS on_call_schedule_members;
DROP TABLE IF EXISTS on_call_schedules;
