CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    check_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED', 'PENDING')),
    message JSONB NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_check_id_created_at
    ON notifications (check_id, created_at DESC);
