ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS incident_id BIGINT REFERENCES incidents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_incident_id ON notifications (incident_id);
