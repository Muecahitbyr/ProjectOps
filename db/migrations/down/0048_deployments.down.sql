ALTER TABLE audit_log DROP CONSTRAINT audit_log_category_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check CHECK (category IN (
    'AUTH', 'ALERT', 'AUTOMATION', 'NOTIFICATION', 'INCIDENT',
    'MAINTENANCE', 'BACKUP', 'USER', 'SYSTEM', 'SLO', 'SERVICE', 'ON_CALL'
));

DROP TABLE IF EXISTS deployments;
