ALTER TABLE maintenance_windows DROP COLUMN IF EXISTS change_id;
DROP TABLE IF EXISTS change_services;
DROP TABLE IF EXISTS changes;

ALTER TABLE audit_log DROP CONSTRAINT audit_log_category_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_category_check CHECK (category IN (
    'AUTH', 'ALERT', 'AUTOMATION', 'NOTIFICATION', 'INCIDENT', 'MAINTENANCE', 'BACKUP', 'USER',
    'SYSTEM', 'SLO', 'SERVICE', 'ON_CALL', 'DEPLOYMENT'
));
