ALTER TABLE audit_log DROP CONSTRAINT audit_log_category_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check CHECK (category IN (
    'AUTH', 'ALERT', 'AUTOMATION', 'NOTIFICATION', 'INCIDENT', 'MAINTENANCE', 'BACKUP', 'USER',
    'SYSTEM', 'SLO', 'SERVICE', 'ON_CALL', 'DEPLOYMENT', 'CHANGE'
));

DROP TABLE IF EXISTS problem_changes;
DROP TABLE IF EXISTS problem_incidents;
DROP TABLE IF EXISTS problems;
