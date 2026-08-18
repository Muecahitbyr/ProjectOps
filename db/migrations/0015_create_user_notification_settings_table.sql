CREATE TABLE IF NOT EXISTS user_notification_settings (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES notification_channels(id),
    enabled BOOLEAN NOT NULL DEFAULT true,
    -- Stunde (0-23, lokale Serverzeit) - Ruhezeit kann ueber Mitternacht
    -- gehen (z.B. start=22, end=6), das wird in der Anwendungsschicht
    -- ausgewertet, nicht per SQL-Constraint.
    quiet_hours_start SMALLINT CHECK (quiet_hours_start BETWEEN 0 AND 23),
    quiet_hours_end SMALLINT CHECK (quiet_hours_end BETWEEN 0 AND 23),
    -- Leeres Array = keine Einschraenkung (alle Severities/Projekte).
    severity_filter TEXT[] NOT NULL DEFAULT '{}',
    project_filter TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_settings_user_id ON user_notification_settings (user_id);
