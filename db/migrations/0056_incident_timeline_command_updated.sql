-- Phase 32 "Enterprise Incident Command Center & Operational Coordination"
-- Auftragspunkt 9 "Timeline" - "Keine zweite Timeline" bedeutet die
-- bestehende incident_timeline_events-Tabelle wird verwendet (nicht
-- dupliziert), nicht dass kein neuer event_type-Wert ergaenzt werden darf.
-- Bestandsanalyse: keiner der 11 bestehenden Werte (CREATED/ALERT_TRIGGERED/
-- NOTIFICATION_SENT/ACKNOWLEDGED/AUTOMATION_*/RESOLVED/REOPENED/COMMENTED/
-- ASSIGNED) passt praezise auf "eine Command-Rolle wurde zugewiesen/entfernt
-- oder ein Checklist-Item geaendert" - COMMENTED ist explizit fuer
-- freitextige MENSCHLICHE Kommentare reserviert (siehe commentSchema,
-- routes/incidents.routes.ts), ASSIGNED bereits fest an incidents.assignee_id
-- gebunden. Derselbe, bereits etablierte Praezedenzfall wie die Erweiterung
-- um 'INCIDENT_ESCALATED' (Phase 27, notification_events) oder 'FAILED'
-- (Phase 28, changes) - ein neuer Wert fuer eine echte, bisher fehlende
-- Bedeutung.
ALTER TABLE incident_timeline_events DROP CONSTRAINT incident_timeline_events_event_type_check;
ALTER TABLE incident_timeline_events ADD CONSTRAINT incident_timeline_events_event_type_check CHECK (event_type IN (
    'CREATED', 'ALERT_TRIGGERED', 'NOTIFICATION_SENT', 'ACKNOWLEDGED',
    'AUTOMATION_STARTED', 'AUTOMATION_SUCCEEDED', 'AUTOMATION_FAILED',
    'RESOLVED', 'REOPENED', 'COMMENTED', 'ASSIGNED', 'COMMAND_UPDATED'
));
