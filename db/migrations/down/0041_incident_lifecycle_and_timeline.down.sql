DROP TABLE IF EXISTS incident_timeline_events;
DROP INDEX IF EXISTS idx_incidents_acknowledged_at;
DROP INDEX IF EXISTS idx_incidents_resolved_at;
DROP INDEX IF EXISTS idx_incidents_severity_created_at;
ALTER TABLE incidents DROP COLUMN IF EXISTS resolution_reason;
ALTER TABLE incidents DROP COLUMN IF EXISTS assignee_id;
ALTER TABLE incidents DROP COLUMN IF EXISTS acknowledged_by;
ALTER TABLE incidents DROP COLUMN IF EXISTS acknowledged_at;
