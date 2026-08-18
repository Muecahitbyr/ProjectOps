DROP INDEX IF EXISTS idx_services_observability;
ALTER TABLE services DROP COLUMN IF EXISTS observability;
