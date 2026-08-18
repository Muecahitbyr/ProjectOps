-- Auftragspunkt 3 "Notification Infrastructure" (Phase 10): ein von
-- IncidentAnalysis (ai/analysis.types.ts) unabhaengiges, einheitliches
-- Notification-Event-Modell fuer Alert Trigger/Eskalation, Wartungsfenster
-- Start/Ende und Root-Incidents - siehe notifications/notification-event.types.ts.
-- Die bestehende notifications-Tabelle (Offline-Benachrichtigungen mit
-- KI-Analyse, Phase 7) bleibt unveraendert bestehen.
CREATE TABLE notification_events (
    id BIGSERIAL PRIMARY KEY,
    event_type TEXT NOT NULL CHECK (
        event_type IN (
            'ALERT_TRIGGERED',
            'ALERT_ESCALATED',
            'MAINTENANCE_STARTED',
            'MAINTENANCE_ENDED',
            'ROOT_INCIDENT_OPENED'
        )
    ),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'HIGH', 'CRITICAL')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'PUSH', 'IN_APP', 'WEBSOCKET')),
    status TEXT NOT NULL CHECK (status IN ('SENT', 'FAILED', 'PENDING')),
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_events_project_id ON notification_events (project_id, created_at DESC);
CREATE INDEX idx_notification_events_channel_in_app ON notification_events (created_at DESC) WHERE channel = 'IN_APP';
