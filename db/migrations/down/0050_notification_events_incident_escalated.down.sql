ALTER TABLE notification_events DROP CONSTRAINT notification_events_event_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_event_type_check CHECK (event_type IN (
    'ALERT_TRIGGERED', 'ALERT_ESCALATED', 'MAINTENANCE_STARTED', 'MAINTENANCE_ENDED', 'ROOT_INCIDENT_OPENED'
));
