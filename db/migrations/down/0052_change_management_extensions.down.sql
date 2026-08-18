ALTER TABLE changes DROP CONSTRAINT changes_status_check;
ALTER TABLE changes ADD CONSTRAINT changes_status_check CHECK (status IN (
    'DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
));

ALTER TABLE changes DROP COLUMN IF EXISTS failure_reason;
ALTER TABLE changes DROP COLUMN IF EXISTS deployment_id;
ALTER TABLE changes DROP COLUMN IF EXISTS category;
