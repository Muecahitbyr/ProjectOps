-- Phase 27 "Enterprise On-Call & Escalation Management" - Bugfix (echter,
-- live gefundener Fehler waehrend der E2E-Tests, siehe Abschlussbericht
-- "Gefundene echte Bugs"): notification-event.types.ts#NotificationEventType
-- wurde um "INCIDENT_ESCALATED" erweitert, aber die DB-Check-Constraint auf
-- notification_events.event_type wurde dabei vergessen zu aktualisieren -
-- exakt dieselbe Bugklasse, die in Phase 22 bereits einmal auftrat (siehe
-- Kommentar in 0045_audit_log_service_category.sql) und die dort als Lehre
-- dokumentiert wurde. Jeder dispatchNotificationEvent({type:
-- "INCIDENT_ESCALATED"})-Aufruf schlug dadurch beim tatsaechlichen
-- INSERT still fehl (Fehler wird nur pro Kanal geloggt, siehe notification-
-- event.service.ts - der eigentliche Eskalationsfluss lief trotzdem
-- weiter, aber der In-App-/Email-Benachrichtigungsverlauf fehlte).
ALTER TABLE notification_events DROP CONSTRAINT notification_events_event_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_event_type_check CHECK (event_type IN (
    'ALERT_TRIGGERED', 'ALERT_ESCALATED', 'MAINTENANCE_STARTED', 'MAINTENANCE_ENDED',
    'ROOT_INCIDENT_OPENED', 'INCIDENT_ESCALATED'
));
