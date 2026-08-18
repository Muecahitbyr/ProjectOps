ALTER TABLE incident_timeline_events DROP CONSTRAINT incident_timeline_events_event_type_check;
ALTER TABLE incident_timeline_events ADD CONSTRAINT incident_timeline_events_event_type_check CHECK (event_type IN (
    'CREATED', 'ALERT_TRIGGERED', 'NOTIFICATION_SENT', 'ACKNOWLEDGED',
    'AUTOMATION_STARTED', 'AUTOMATION_SUCCEEDED', 'AUTOMATION_FAILED',
    'RESOLVED', 'REOPENED', 'COMMENTED', 'ASSIGNED'
));
